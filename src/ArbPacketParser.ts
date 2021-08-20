import { Writable } from 'stream'

export interface PacketSpec {
    write(chunk: Buffer): [boolean, number]
    timeout(): void
}

export class ArbPacketParser extends Writable {
    ps?: PacketSpec
    constructor() {
        super()
    }
    newPacketSpec(ps: PacketSpec) {
        if (this.ps) {
            const finished = this.ps.write(Buffer.alloc(0))[0]
            if (!finished) {
                throw "Previous parser not finished"
            }
        }
        this.ps = ps
    }
    _write(chunk: any, encoding: BufferEncoding, cb: (error?: Error | null) => void): void {
        let remaining = Buffer.from(chunk)
        while ((remaining.length > 0) && this.ps) {
            let [finished, used] = this.ps.write(remaining)
            if (finished) {
                this.ps = undefined
            }
            remaining = remaining.slice(used)
        }
        if (remaining.length > 0) {
            this.emit('unexpected', remaining)
        }
        cb()
    }
}
