---
"cronbake": patch
---

Fix `Cron.getPrevious` and `lastExecution()` freezing the process when the search crossed a clock going forward. A schedule that covers every hour now keeps its pace through an hour repeated when clocks go back, where 0.4 paused it for that hour. A schedule tied to certain hours still runs once.
