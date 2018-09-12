# postgres-loadgen

This repo will contain a small load generator for PostgreSQL that tests whether
certain pathological behaviors are seen under simple workloads.

## Status

- complete: basic load generator
- complete: set up basic Prometheus instance
- complete: set up basic Grafana instance with dashboard
- complete: basic load generator work for reads + writes

## ToDo

- can we collect CPU usage information in Prometheus for the load generator(s)?
- add a query that generates errors occasionally to make sure the metrics work
- figure out where to run all this
  - Macbook VM?
  - one container for loadgen, prometheus, grafana
  - one container for postgres
    - need ZFS for snapshots
    - need lots of disk space (bigger than DRAM)

## Ideal test plan

- set up all zones
- begin monitoring
- begin workload
- watch query latency.  expected events:
  - spills out of shared buffers
  - spills out of DRAM
  - next vacuum
  - next anti-wraparound vacuum

## Latest versions tried

prometheus@2.3.2
grafana@5.2.4
pgstatsmon@c3c085eeac127b37674809d0d41bd5fc368e744e
