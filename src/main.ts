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
            const b = Buffer.from(chunk)
            let [finished, used] = this.rp.write(b)
            if (finished) {
                if (used < b.length) {
                    // There are extra bytes need to give to next parser?
                }
            }
        }
        // TODO: This is a very big error state
        cb()
    }
    _flush(cb: TransformCallback) {
        cb()
    }
}
interface SpeeduinoResponseParser {
    write(chunk: Buffer): [boolean, number]
    stop(): void
}

interface SpeeduinoResponseParserPromise extends SpeeduinoResponseParser{
    getValue(): Promise<Buffer>
}

class SResponse {
    length: number
    position: number
    buffer: Buffer
    p: Promise<Buffer>
    pResolve?: (value: Buffer | PromiseLike<Buffer>) => void
    pReject?: (reason?: any) => void
    constructor() {
        this.length = 20
        this.position = 0
        this.buffer = Buffer.alloc(this.length)
        this.p = new Promise((resolve, reject) => {
            this.pResolve = resolve
            this.pReject = reject
        })
    }
    write(chunk: Buffer): [boolean, number] {
        let cursor = 0
        while (cursor < chunk.length) {
            this.buffer[this.position] = chunk[cursor]
            cursor++
            this.position++
            if (this.position === this.length) {
                if (this.pResolve) {
                    this.pResolve(this.buffer)
                    this.pResolve = undefined
                    this.pReject = undefined
                }
                return [true, cursor]
            }
        }
        return [false, cursor]
    }
    stop() {
        if (this.pReject) {
            this.pReject(this.buffer)
            this.pResolve = undefined
            this.pReject = undefined
        }
    }
    getValue(): Promise<Buffer> {
        return this.p
    }
}

class SpeeduinoComm {
    path: string
    sp: SerialPort
    parser: SpeeduinoParser

    constructor(path: string) {
        this.path = path
        this.sp = new SerialPort(path, {baudRate: 115200, autoOpen: false})
        this.sp.pipe(new HexTransformer()).pipe(process.stdout)
        this.parser = new SpeeduinoParser
        this.sp.pipe(this.parser)
    }

    open(cb?: (error?: Error | null) => void) {
        this.sp.open(cb)
    }

    write(buffer: string | number[] | Buffer) {
        this.sp.write(buffer)
    }

    sendCommand(cmd: Buffer, rp: SpeeduinoResponseParserPromise): Promise<Buffer> {
        this.parser.addParser(rp)
        this.write(cmd)
        return rp.getValue()
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
        speedy.sendCommand(Buffer.from('Q'), new SResponse).then((response) => {
            console.log(response)
        })
        // speedy.write(Buffer.from([0x72, 0x00, 0x30, 0x00, 0x00, 0x72, 0x00]))
    })
})