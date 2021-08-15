import SerialPort from 'serialport'
import prompt from 'prompt';
import { Transform, TransformCallback } from 'stream'
import { createBrotliCompress } from 'zlib';

class HexTransformer extends Transform {
    _transform(chunk: any, encoding: BufferEncoding, cb: TransformCallback): void {
        let cursor = 0
        while (cursor < chunk.length) {
            this.push("0x" + chunk[cursor].toString(16) + " ")
            cursor++
        }
        cb();
    }
    _flush(cb: TransformCallback) {
        cb()
    }
}

class SpeeduinoParser extends Transform {
    rp: SpeeduinoResponseParser | null
    constructor() {
        super()
        this.rp = null
    }
    addParser(rp: SpeeduinoResponseParser) {
        this.rp = rp
    }
    _transform(chunk: any, encoding: BufferEncoding, cb: TransformCallback): void {
        if (this.rp) {
            let remaining = this.rp.write(Buffer.from(chunk))
            if (remaining) {
                if (remaining.length !== 0) {
                    // There are extra bytes need to give to next parser?
                }
            }
            return
        }
        // TODO: This is a very big error state
    }
    _flush(cb: TransformCallback) {
        
    }
}
interface SpeeduinoResponseParser {
    write(chunk: Buffer): Buffer | null
    stop(): void
}

class SResponse {
    length: number
    position: number
    buffer: Buffer
    cb?: (response: Buffer) => void
    constructor(cb?: (response: Buffer) => void) {
        this.length = 21
        this.position = 0
        this.buffer = Buffer.alloc(this.length)
        this.cb = cb
    }
    write(chunk: Buffer): Buffer | null {
        let cursor = 0
        while (cursor < chunk.length) {
            this.buffer[this.position] = chunk[cursor]
            cursor++
            this.position++
            if (this.position === this.length) {
                if (this.cb) {
                    this.cb(this.buffer)
                }
                return chunk.slice(this.position, chunk.length)
            }
        }
        return null
    }
    stop() {

    }
}

class SpeeduinoComm {
    path: string
    sp: SerialPort

    constructor(path: string) {
        this.path = path
        this.sp = new SerialPort(path, {baudRate: 115200, autoOpen: false})
        this.sp.pipe(new HexTransformer()).pipe(process.stdout)
    }

    open(cb?: (error?: Error | null) => void) {
        this.sp.open(cb)
    }

    write(buffer: string | number[] | Buffer) {
        this.sp.write(buffer)
    }

    getVersion(): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            resolve(Buffer.alloc(0))
        })
    }
}


console.log("Initial run");
SerialPort.list().then(async (ports) => {
    for (let idx in ports) {
        const port = ports[idx]
        console.log(`[${idx}]: ${port.path}`)
    }
    const choice = await prompt.get(['id'])
    const port = ports[parseInt(choice['id'] as string)]

    const speedy = new SpeeduinoComm(port.path)
    speedy.open((err) => {
        if (err) throw err
        // speedy.write('S')
        speedy.getVersion().then((response) => {
            console.log(response)
        })
        // speedy.write(Buffer.from([0x72, 0x00, 0x30, 0x00, 0x00, 0x72, 0x00]))
    })
})