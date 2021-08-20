import { PacketSpecPromise } from './PacketisedHalfDuplex'

export class NoResponse implements PacketSpecPromise {
    p: Promise<Buffer>
    constructor() {
        this.p = new Promise(resolve => resolve(Buffer.alloc(0)))
    }
    write(chunk: Buffer): [boolean, number] {
        return [true, 0]
    }
    timeout() {
    }
    getValue(): Promise<Buffer> {
        return this.p
    }
}

export class SResponse implements PacketSpecPromise {
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
        if (!this.pResolve) return [true, 0]
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
    timeout() {
        if (this.pReject) {
            this.pReject(new Error('Timeout'))
            this.pResolve = undefined
            this.pReject = undefined
        }
    }
    getValue(): Promise<Buffer> {
        return this.p
    }
}

export class TResponse implements PacketSpecPromise {
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
        this.intervalID = setTimeout(() => this.emitPacket(), this.interval)
        return [false, cursor]
    }
    emitPacket() {
        this.pResolve!(this.buffer.slice(0, this.position))
        this.pResolve = undefined
        this.pReject = undefined
    }
    timeout() {
        if (this.pReject) {
            this.pReject(new Error('Timeout'))
            this.pResolve = undefined
            this.pReject = undefined
        }
    }
    getValue(): Promise<Buffer> {
        return this.p
    }
}