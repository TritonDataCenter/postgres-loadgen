# postgres-loadgen

This repo will contain a small load generator for PostgreSQL that tests whether
certain pathological behaviors are seen under simple workloads.

## Status

- complete: basic load generator
- complete: set up basic Prometheus instance

## ToDo

- grafana
- load generator work to support desired workload (reads + writes)
- postgres setup
  - config file
- figure out where to run all this
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
