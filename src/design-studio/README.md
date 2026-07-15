# Design Studio

The Design Studio authors the World’s Authored Room. Its Edit Session module
keeps a transient preview separate from committed room state until it is
validated and committed.

`design-studio.ts` owns the Design Studio action transitions. Application
composition delegates Design Studio actions to this compact interface while it
keeps gameplay input and ticking separate.
