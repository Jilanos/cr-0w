# Audit a CAN acquisition without changing inputs

1. Read the existing ID inventory, remapping and workbook helpers before creating a new analysis.
2. Copy the raw capture only when absent. Hash the original, copy, DBCs and referenced documents before and after processing.
3. Read BLF messages with python-can. Group by channel, standard/extended identifier and frame kind. Error events have no arbitration ID; do not label them NMT ID zero.
4. Reconcile the BLF object count with a bounded container audit. Driver statistics, controller state changes and synchronization objects are distinct from bus frames. Reject unexplained object classes.
5. Calculate count, all inter-arrival intervals, population standard deviation, extrema, DLCs and byte activity. Preserve singleton cases and missing payload bytes.
6. Prefer the retained DBC corpus, then documented dates/versions. Keep every ID/IDE match, check DLC compatibility, and retain the full source path. A definition match cannot establish the physical transmitter.
7. Read remapping constants through AST when importing their module would write outputs. Check entire reserved blocks and separate standard from extended identifiers. Distinguish expected battery occupancy, potential collision and documentary reservation.
8. Compare ASC and BLF by duration, counts, timestamps and payload sequences. Different exports do not by themselves rule out separate phases of the same outing.
9. Use primary manufacturer and protocol sources for unresolved IDs. Label every web attribution as a hypothesis; a range or plausible payload alone cannot identify the ECU. Decode extended IDs mechanically without presuming J1939.
10. State the bitrate assumption and frame-overhead/stuffing bounds for bus load. Reopen the workbook, reconcile row totals and statistical identities, inspect styles and filters, and report verified and unverified items separately.

The analysis script should contain the reproduction command and freeze the researched hypotheses and URLs for offline reruns.
