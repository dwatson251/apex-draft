# Circuit data

The shapes of the real circuits hidden in the game (Spa-Francorchamps, Monza, Silverstone, the Circuit de Barcelona-Catalunya,
Laguna Seca, Monaco, the Circuit de la Sarthe at Le Mans, Daytona's road course, Donington Park and Willow Springs) are made from
[OpenStreetMap](https://www.openstreetmap.org) data.

> Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the
> [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/).

What is in `packages/sim/src/circuitData.ts` is a derived database: for each circuit, the centre line of the lap (from the
`highway=raceway` ways, or the ways of the circuit's relation, in OpenStreetMap), scaled to the game and bent as little as possible to make a
road the cars can drive (no turn tighter than a radius of 36 units, no two parts of the road closer than 60). It is shared here under the
same licence. The code in `tools/circuits` shows exactly how it is made, and can be run again against the live map.

The names of the circuits and their corners belong to their owners and are used only to say what the shape is.

Autodrome Lago Maggiore is the exception: it is a fictional circuit (from Gran Turismo), not a mapped one. Its shape is traced from the
track-map outline on the [Gran Turismo wiki](https://gran-turismo.fandom.com/wiki/Autodrome_Lago_Maggiore_-_Full_Course) and scaled to its
published length of 5.8 km (`tools/circuits/trace_image.py` and `trace.ts`). The image itself is not kept in this repository.
