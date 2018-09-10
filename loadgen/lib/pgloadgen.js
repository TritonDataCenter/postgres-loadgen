/*
 * pgloadgen.js: library interface for load generator
 *
 * TODO parse connection string explicitly via pg-connection-string to minimize
 * loosey-goosey DWIM behavior?
 * TODO TCP keep-alive for connections; auto-reconnect
 */

var mod_assertplus = require('assert-plus');
var mod_artedi = require('artedi');
var mod_extsprintf = require('extsprintf');
var mod_http = require('http');
var mod_jsprim = require('jsprim');
var mod_pg = require('pg');
var mod_uuid = require('uuid');
var mod_vasync = require('vasync');

var VError = require('verror');

var sprintf = mod_extsprintf.sprintf;

/* Exported interface */
exports.createLoadGenerator = createLoadGenerator;

function createLoadGenerator(args)
{
	return (new LoadGenerator(args));
}

/* Load generator states */
var LGS_UNINIT = 'not yet started';
var LGS_INIT_IN_PROGRESS = 'initialization in progress';
var LGS_RUNNING = 'running';
var LGS_FAILED = 'failed';

function LoadGenerator(args)
{
	mod_assertplus.object(args, 'args');
	mod_assertplus.object(args.lgc_log, 'args.lgc_log');
	mod_assertplus.number(args.lgc_concurrency, 'args.lgc_concurrency');
	mod_assertplus.ok(args.lgc_concurrency > 0);
	mod_assertplus.string(args.lgc_pgurl, 'args.lgc_pgurl');
	mod_assertplus.number(args.lgc_http_port, 'args.lgc_http_port');

	/* configuration */
	this.lg_log = args.lgc_log;
	this.lg_maxconcurrency = args.lgc_concurrency;
	this.lg_pgurl = args.lgc_pgurl;
	this.lg_http_port = args.lgc_http_port;

	/* runtime state */
	this.lg_state = LGS_UNINIT;
	this.lg_collector = mod_artedi.createCollector();

	this.lg_init = null;		/* initialization vasync handle */
	this.lg_error = null;		/* fatal error, if any */
	this.lg_pgclients = null;	/* postgres client */
	this.lg_metric_server = null;	/* metric HTTP server */
	this.lg_maxid = null;		/* max id in the table */

	/* artedi metrics */
	this.lg_g_nconns = this.lg_collector.gauge({
	    'name': 'pgloadgen_nconns',
	    'help': 'count of open connections'
	});
	this.lg_c_nstarted = this.lg_collector.counter({
	    'name': 'pgloadgen_nqueries_started',
	    'help': 'count of queries started'
	});
	this.lg_c_ndone = this.lg_collector.counter({
	    'name': 'pgloadgen_nqueries_done',
	    'help': 'count of queries completed'
	});
	this.lg_c_nfailed = this.lg_collector.counter({
	    'name': 'pgloadgen_nqueries_failed',
	    'help': 'counter of queries that failed'
	});
	this.lg_c_errors = this.lg_collector.counter({
	    'name': 'pgloadgen_error_messages',
	    'help': 'count of each error message'
	});
	this.lg_hist_queries = this.lg_collector.histogram({
	    'name': 'pgloadgen_query_latency_us',
	    'help': 'query latency'
	});

	this.lg_g_nconns.set(0, {
	    'pgUrl': this.lg_pgurl
	});
}

LoadGenerator.prototype.start = function (callback)
{
	var lg = this;

	mod_assertplus.func(callback, 'callback');
	mod_assertplus.equal(LGS_UNINIT, this.lg_state);
	this.lg_log.debug('starting load generator');
	this.lg_state = LGS_INIT_IN_PROGRESS;
	this.lg_init = mod_vasync.waterfall([
	    function initPg(subcallback) {
		    lg.initPg(subcallback);
	    },
	    function initArtedi(subcallback) {
		    lg.initArtedi(subcallback);
	    }
	], function (err) {
		if (err) {
			err = new VError(err, 'starting load generator');
			lg.fail(err);
		}

		lg.initRequests();
		callback(err);
	});
};

LoadGenerator.prototype.fail = function (err)
{
	mod_assertplus.notEqual(this.lg_state, LGS_UNINIT);
	if (this.lg_state == LGS_FAILED) {
		return;
	}

	mod_assertplus.strictEqual(this.lg_error, null);
	this.lg_log.debug(err);
	this.lg_state = LGS_FAILED;
	this.lg_error = err;
};

LoadGenerator.prototype.initPg = function (callback)
{
	var client, queue;
	var error, i;
	var lg = this;

	mod_assertplus.func(callback, 'callback');
	mod_assertplus.strictEqual(this.lg_pgclients, null);
	this.lg_pgclients = [];

	/*
	 * This could be better parallelized, but there's no need to hammer the
	 * PostgreSQL server here.
	 */
	error = null;
	queue = mod_vasync.queuev({
	    'concurrency': 1,
	    'worker': function (_, subcallback) {
		    if (error !== null) {
			    return;
		    }

		    client = new mod_pg.Client({
			'connectionString': lg.lg_pgurl
		    });

		    lg.lg_pgclients.push(client);
		    lg.lg_log.debug('creating connection');
		    client.connect(function onPgConnectDone(err) {
			    if (err && error === null) {
				    error = err;
			    } else {
				    lg.lg_log.debug('created connection');
				    lg.lg_g_nconns.add(1, {
				        'pgUrl': lg.lg_pgurl
				    });
			    }

			    subcallback();
		    });
	    }
	});

	queue.on('end', function () {
		if (error) {
			for (i = 0; i < lg.lg_pgclients.length; i++) {
				/* XXX need to block for these */
				client.end();
				lg.lg_g_nconns.add(-1, {
				    'pgUrl': lg.lg_pgurl
				});
			}
		}

		callback(error);
	});

	for (i = 0; i < this.lg_maxconcurrency; i++) {
		queue.push(i);
	}

	queue.close();
};

LoadGenerator.prototype.initArtedi = function (callback)
{
	var lg = this;

	mod_assertplus.func(callback, 'callback');
	this.lg_metric_server = mod_http.createServer(
	    function (request, response) {
		    lg.httpHandleRequest(request, response);
	    });

	/*
	 * This seems like a pretty cumbersome way for Node to report this
	 * error.
	 */
	var handleListenError = function (err) {
		err = new VError(err, 'starting metric server');
		callback(err);
	};
	this.lg_metric_server.on('error', handleListenError);
	this.lg_metric_server.listen(this.lg_http_port, '127.0.0.1',
	    function () {
		lg.lg_metric_server.removeListener('error', handleListenError);
		callback();
	    });
};

LoadGenerator.prototype.initRequests = function ()
{
	var i;

	for (i = 0; i < this.lg_pgclients.length; i++) {
		this.clientRequest(this.lg_pgclients[i]);
	}
};

LoadGenerator.prototype.httpHandleRequest = function (request, response)
{
	var lg = this;

	if (request.url != '/metrics') {
		response.writeHead(404, { 'connection': 'close' });
		response.end();
		return;
	}

	if (request.method != 'GET') {
		response.writeHead(405, { 'connection': 'close' });
		response.end();
		return;
	}

	this.lg_collector.collect(mod_artedi.FMT_PROM, function (err, metrics) {
		if (err) {
			response.writeHead(500, { 'connection': 'close' });
			lg.lg_log.warn(err, 'failed to collect metrics');
			response.end();
			return;
		}

		request.on('end', function () {
			response.writeHead(200, {
			    'Content-Type': 'text/plain; version=0.0.4'
			});
			response.end(metrics);
		});

		request.resume();
	});
};

LoadGenerator.prototype.clientRequest = function (client)
{
	/*
	 * XXX We could use a better structure here to keep track of client
	 * state so that we can assert that there's no outstanding request.  We
	 * could also add client URL information to the artedi metrics.
	 */
	var lg = this;
	var r, maxid, start, sql, fields, histfields;

	r = Math.random();
	fields = {};
	/*
	 * XXX when selecting or updating using "maxid", we should bump an error
	 * counter when maxid is null and skip the operation.
	 */
	maxid = this.lg_maxid;
	mod_assertplus.ok(typeof (maxid) == 'number' || maxid === null);
	if (r < 0.01) {
		/* 1%: read latest max id */
		sql = sprintf('SELECT MAX(id) AS max FROM test_table;');
		fields['type'] = 'fetch_max';
	} else if (r < 0.2) {
		/* 20%: read operation */
		sql = sprintf(
		    'BEGIN; SELECT * FROM test_table WHERE id = %d; COMMIT;',
		    maxid === null ? 1 : Math.floor(maxid * Math.random()));
		fields['type'] = 'read_row';
	} else if (r < 0.8) {
		/* 60%: insert operation */
		sql = sprintf('BEGIN; INSERT INTO test_table ' +
		    '(c1, c2, c3, c4, c5) VALUES ' +
		    '(\'%s\', \'%s\', \'%s\', \'%s\', \'%s\'); COMMIT;',
		    mod_uuid.v4(), mod_uuid.v4(), mod_uuid.v4(), mod_uuid.v4(),
		    mod_uuid.v4());
		fields['type'] = 'insert_row';
	} else {
		/*
		 * 19%: update operation.
		 * This is not a great construct, but matches the target
		 * workload.
		 */
		sql = sprintf('BEGIN; SELECT * FROM test_table WHERE id = %d ' +
		    ' FOR UPDATE; UPDATE test_table SET c1 = \'%s\', ' +
		    ' c2 = \'%s\', c3 = \'%s\', c4 = \'%s\', c5 = \'%s\' ' +
		    'WHERE id = %d; COMMIT;',
		    maxid === null ? 1 : Math.floor(maxid * Math.random()),
		    mod_uuid.v4(), mod_uuid.v4(), mod_uuid.v4(), mod_uuid.v4(),
		    mod_uuid.v4(), maxid);
		fields['type'] = 'update_row';
	}

	/*
	 * TODO it would be nice to put "sql" into "fields", but we'd want to
	 * normalize the queries to avoid an enormous number of metrics.
	 */
	histfields = {
	    'type': fields['type']
	};
	lg.lg_log.trace(fields, 'begin query');
	start = process.hrtime();
	client.query(sql, function (err, result) {
		var delta, message;

		delta = mod_jsprim.hrtimeMicrosec(process.hrtime(start));
		lg.lg_log.trace({
		    'type': fields['type'],
		    'sql': sql,
		    'result': err ? 'error': 'ok',
		    'timeMicrosec': delta
		}, 'finished query');

		if (fields['type'] == 'fetch_max') {
			/*
			 * Update the max id seen.
			 */
			if (!err) {
				mod_assertplus.arrayOfObject(result.rows);
				mod_assertplus.equal(result.rows.length, 1);
				if (result.rows[0]['max'] === null) {
					mod_assertplus.strictEqual(
					    lg.lg_maxid, null);
					/* No other action needed. */
				} else {
					mod_assertplus.string(
					    result.rows[0]['max']);
					err = mod_jsprim.parseInteger(
					    result.rows[0]['max']);
					if (!(err instanceof Error)) {
						lg.lg_maxid = err;
						err = null;
					}
				}
			}

			if (err) {
				err = new VError(err, 'failed to update maxid');
				lg.lg_log.error(err);
				/* Fall through to error case. */
			}
		}

		if (err) {
			err = new VError(err, 'query failed');
			histfields['result'] = 'error';
			lg.lg_c_nfailed.add(1, fields);

			/* work around node-artedi#16 */
			message = JSON.stringify(err.message);
			message = message.substr(1, message.length - 2);
			lg.lg_c_errors.add(1, {
			    'errorMessage': message
			});
		} else {
			histfields['result'] = 'ok';
		}

		lg.lg_c_ndone.add(1, fields);
		lg.lg_hist_queries.observe(delta, histfields);
		lg.clientRequest(client);
	});

	lg.lg_c_nstarted.add(1, fields);
};
