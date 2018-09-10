Starting the docker host:

    docker-machine start dapnew
    docker-machine env dapvm

Finding the IP of the docker host:

    docker-machine ip dapnew

Running PostgreSQL 9.6.3 in Docker (will DELETE the database when it stops):

    docker run --rm --name=postgres-test -p 5432 -it postgres:9.6 

Finding the exposed port of PostgreSQL on the Docker host:

    docker inspect postgres-test

Starting load generator:

    ./bin/pgloadgen -c 10 postgres://postgres:postgres@HOST_IP:PORT/postgres

Start Prometheus:

    ./prometheus --config.file=prometheus.yml
