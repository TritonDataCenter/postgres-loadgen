-- 
-- schema.sql: schema for test workload.
-- We want several text columns, a few of which are indexed.
--
CREATE SEQUENCE test_table_id;

CREATE TABLE test_table (
    id bigint NOT NULL DEFAULT nextval('test_table_id'),
    c1 text,
    c2 text,
    c3 text,
    c4 text,
    c5 text
);

CREATE UNIQUE INDEX by_id ON test_table (id);
CREATE INDEX by_c1 ON test_table (c1);
CREATE INDEX by_c2 ON test_table (c2);
CREATE INDEX by_c3 ON test_table (c3);
