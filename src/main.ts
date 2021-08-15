import SerialPort from 'serialport'
import prompt from 'prompt';
import { Transform, TransformCallback, Writable } from 'stream'
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

class SpeeduinoParser extends Writable {
    rp?: SpeeduinoResponseParser
    constructor() {
        super()
    }
    addParser(rp: SpeeduinoResponseParser) {
        if (this.rp) {
            const finished = this.rp.write(Buffer.alloc(0))[0]
            if (!finished) {
                throw "Previous parser not finished"
            }
        }
        this.rp = rp
    }
    _write(chunk: any, encoding: BufferEncoding, cb: (error?: Error | null) => void): void {
        let remaining = Buffer.from(chunk)
        while ((remaining.length > 0) && this.rp) {
            let [finished, used] = this.rp.write(remaining)
            if (finished) {
                this.rp = undefined
            }
            remaining = remaining.slice(used)
        }
        if (remaining.length > 0) {
            this.emit('unexpected', remaining)
        }
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

class SResponse implements SpeeduinoResponseParserPromise{
    position: number
    buffer: Buffer
    p: Promise<Buffer>
    pResolve?: (value: Buffer | PromiseLike<Buffer>) => void
    pReject?: (reason?: any) => void
    constructor(length: number) {
        this.position = 0
        this.buffer = Buffer.alloc(length)
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
            if (this.position === this.buffer.length) {
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

class TResponse implements SpeeduinoResponseParserPromise{
    interval: number
    intervalID?: NodeJS.Timeout
    position: number
    buffer: Buffer
    p: Promise<Buffer>
    pResolve?: (value: Buffer | PromiseLike<Buffer>) => void
    pReject?: (reason?: any) => void
    constructor(interval: number, maxBufferSize: number = 65536) {
        this.position = 0
        this.buffer = Buffer.alloc(maxBufferSize)
        this.interval = interval
        this.p = new Promise((resolve, reject) => {
            this.pResolve = resolve
            this.pReject = reject
        })
    }
    write(chunk: Buffer): [boolean, number] {
        if (!this.pResolve) return [true, 0]
        if (this.intervalID) clearTimeout(this.intervalID)
        let cursor = 0
        while (cursor < chunk.length) {
            this.buffer[this.position] = chunk[cursor]
            cursor++
            this.position++
            if (this.position === this.buffer.length) {
                this.emitPacket()
                return [true, cursor]
            }
        }
        this.intervalID = setTimeout(this.emitPacket.bind(this), this.interval)
        return [false, cursor]
    }
    emitPacket() {
        this.pResolve!(this.buffer)
        this.pResolve = undefined
        this.pReject = undefined
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
    lastPromise?: Promise<Buffer>

    constructor(path: string) {
        this.path = path
        this.sp = new SerialPort(path, {baudRate: 115200, autoOpen: false})
        this.parser = this.sp.pipe(new SpeeduinoParser)
        this.parser.on('unexpected', (data) => console.log("Unexpected data", data))
    }

    pipe<T extends NodeJS.WritableStream>(destination: T, options?: {end?: boolean}): T {
        return this.sp.pipe(destination)
    }

    open(cb?: (error?: Error | null) => void) {
        this.sp.open(cb)
    }

    write(buffer: string | number[] | Buffer) {
        this.sp.write(buffer)
    }

    async sendCommand(cmd: Buffer, rp: SpeeduinoResponseParserPromise): Promise<Buffer> {
        let lastPromise: Promise<any> | undefined = this.lastPromise
        this.lastPromise = rp.getValue()
        if(!lastPromise) {
            lastPromise = new Promise<void>((resolve) => resolve())
        }
        lastPromise.finally(() => {
            this.parser.addParser(rp)
            this.write(cmd)
        })
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
    // speedy.pipe(new HexTransformer()).pipe(process.stdout)
    speedy.open((err) => {
        if (err) throw err
        // speedy.write('S')
        speedy.sendCommand(Buffer.from('Q'), new SResponse(5)).then((response) => {
            console.log(response.toString('ascii'))
        })
        speedy.sendCommand(Buffer.from('S'), new SResponse(5)).then((response) => {
            console.log(response.toString('ascii'))
        })
        // speedy.write(Buffer.from([0x72, 0x00, 0x30, 0x00, 0x00, 0x72, 0x00]))
    })
})