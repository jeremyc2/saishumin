# Rendering geometry

Pure projection, view framing, resize math, and World depth ordering used by
the rendering system and Design Studio presentation. The external interface is
the named geometry functions in this directory. Geometry observes World data
only and has no DOM lifecycle or gameplay transitions. Its tests are colocated
in `geometry/__tests__/`.
