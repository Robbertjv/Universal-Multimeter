# Test Strategy and Acceptance Plan

**Status:** Reviewed v1.0 implementation baseline (2026-11-20).

## 1. Test layers

### Unit tests
- Protocol frame parsers and decoders.
- Measurement normalization and validation.
- Capability mapping and control parameter validation.
- Device lifecycle state machine.
- Transport buffering and stream handling using mocks.
- CSV serialization and storage schema logic.

### Fixture / regression tests
- Store representative raw frames with model, firmware/revision if known, cable/transport, capture date, provenance, and expected decode.
- Keep fixtures immutable once used in regression tests; add new fixtures rather than silently changing expected output.
- Redact identifiers or personal data.
- Label synthetic fixtures clearly; never present them as hardware captures.

### Integration tests
- Mock transport + real driver + Measurement Engine.
- Device Manager connect/disconnect and failure cleanup.
- Multiple device/channel streams.
- Logger/IndexedDB and CSV round-trip.
- Reconnect and parser reset.

### Browser and hardware tests
- Chrome on Windows, Android, and Ubuntu/Linux.
- Exact instrument model and hardware/firmware revision.
- Exact cable/adapter and chipset.
- Browser version, OS version, API permissions, and connection settings.
- Sustained streaming, dropped/fragmented frames, disconnect/reconnect, and data integrity.
- Controls tested only when documented and safe.

## 2. Required parser cases

Every stream parser should test:
- one complete frame;
- frame split at every relevant byte boundary;
- multiple frames in one chunk;
- leading noise/resynchronization;
- truncated frame;
- invalid header/length;
- bad checksum/CRC where applicable;
- unknown function/status code;
- maximum supported buffer and overflow behavior;
- reset after disconnect.

## 3. Measurement model tests

- finite positive and negative values;
- precision and sign preservation;
- each non-numeric reading state;
- missing and invalid units;
- multi-channel correlation;
- source and receipt timestamps;
- stale quality transition;
- sequence gaps;
- schema version rejection.

## 4. Hardware validation record

For every test run record:
- test ID and date;
- instrument manufacturer/model and exact suffix;
- serial/hardware/firmware details only as needed and with privacy care;
- cable/interface chipset and physical connection;
- OS, browser, browser version;
- transport configuration;
- protocol fixture IDs;
- expected vs observed readings and tolerance rationale;
- tested controls and outcomes;
- known limitations, dropped frames, reconnect behavior;
- tester and result.

## 5. Definition of driver support maturity

- **Not started / scaffold planned:** no functional decoder claim.
- **Experimental:** initial code or parser exists; automated tests may pass, but device behavior is not sufficiently verified.
- **Partially supported:** a documented set of readings/features is verified; limitations are explicit.
- **Fully supported:** all published driver acceptance criteria pass on real hardware for the declared model/variant and listed platform/transport combinations. Do not imply untested platforms are covered.

## 6. CI baseline

CI should run formatting/lint checks, unit tests, fixture tests, and build checks on each pull request. Browser/hardware tests may be manual or run on dedicated hardware; their results must be recorded. CI must not require physical meters for the basic test suite.
