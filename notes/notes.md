## Running PostgreSQL (during development)

Starting the docker host:

    docker-machine start
    docker-machine env

Finding the IP of the docker host:

    docker-machine ip

Running PostgreSQL 9.6.3 in Docker (will DELETE the database when it stops):

    docker run --rm --name=postgres-test -p 5432 -it postgres:9.6 

Finding the exposed port of PostgreSQL on the Docker host:

    docker inspect postgres-test

Connect and initialize the test table:

    psql -h 192.168.99.100 -p PORT -U postgres -f schema.sql

## pgstatsmon

Setting up pgstatsmon:

    # git clone
    # edit Makefile if necessary for use on OS X (remove prebuilt Node refs)
    # make
    # cp etc/static.json config.json
    # vim config.json

Starting pgstatsmon:

    # may need to adjust config file for PostgreSQL port
    vim config.json
    node bin/pgstatsmon.js config.json | tee -a pgstatsmon.log | bunyan -o short

## Prometheus

Setting up Prometheus:

    # download tarball and unpack
    vim prometheus.yml

Starting Prometheus:

    ./prometheus --config.file=prometheus.yml --storage.tsdb.retention=180d | tee -a prometheus.log

## Grafana

Setting up Grafana:

    # download tarball and unpack
    cp conf/sample.ini conf/custom.ini
    vim conf/custom.ini
    # start it (see below)
    # log into UI
    # add data source for Prometheus at http://localhost:9090
    # create PostgreSQL dashboard

Starting Grafana:

    ./bin/grafana-server web | tee -a grafana.log

## pgloadgen (load generator)

Starting load generator (fill in HOST\_IP and PORT):

    ./bin/pgloadgen -c 1 postgres://postgres:postgres@HOST_IP:PORT/postgres | tee -a pgloadgen.out

