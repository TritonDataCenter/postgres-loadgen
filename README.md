# postgres-loadgen

This repo will contain a small load generator for PostgreSQL that tests whether
certain pathological behaviors are seen under simple workloads.

## Status

- complete: basic load generator
- complete: set up basic Prometheus instance
- complete: set up basic Grafana instance with dashboard
- complete: basic load generator work for reads + writes
- complete: add CPU usage to load generator
- complete: add injected errors for validating metrics
- complete: add pgloadgen gauge for max latency

## Ideal test plan

- set up all zones
- begin monitoring
- begin workload
- watch query latency.  expected events:
  - spills out of shared buffers
  - spills out of DRAM
  - next vacuum
  - next anti-wraparound vacuum

## Versions tried

- prometheus@2.3.2, prometheus@2.4.0
- grafana@5.2.4
- pgstatsmon@c3c085eeac127b37674809d0d41bd5fc368e744e
