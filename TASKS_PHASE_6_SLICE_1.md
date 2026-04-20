## Implemented

- authoritative `attack` encounter command
- `combat_event` realtime stream event
- server-side attack roll with injected test roller support
- fixed-damage hit/miss resolution
- action consumption on attack
- HP floor at 0
- tests for success/failure/event emission

## Known follow-up

- attack currently performs separate character and encounter writes
- this is acceptable for in-memory slices, but later persistence should introduce a tighter transaction boundary
