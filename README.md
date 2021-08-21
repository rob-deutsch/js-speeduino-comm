# js-speeduino-comm

This Node library communicates with a Speeduino over a serial port.

It is very much a work-in-progress.

commands.csv shows all the commands supported by the current Speeduino firmware (202108) and how they map to js-speeduino-comm

## Installation

```
yard add speeduino-comm
```

## Sample code
Typescript:
```typescript
#!/usr/bin/env node

import { SpeeduinoComm } from 'speeduino-comm'
const speedy = new SpeeduinoComm({path: '/dev/tty.USB0'})

speedy.open((err) => {
    if (err) { throw err }

    speedy.signature().then(response => console.log("Signature:", response))
    speedy.versionInfo().then(response => console.log("Version info:", response))
    speedy.loopsPerSecond().then(response => console.log("Loops per second:", response))
})
```
