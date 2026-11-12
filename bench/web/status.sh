#!/bin/sh
# how far the bench is
tail -n 30 "$(dirname "$0")/results/run.log"
