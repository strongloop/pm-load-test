pm-load-test
============

Load generating app with a twist: The load generated is targetted at
the process manager that is running this app.

This is done in the form of:
 - random exits
 - high frequency log messages
 - random delays
 - randomly blocking the event loop
