import { PacketisedHalfDuplex, PacketSpecPromise } from './PacketisedHalfDuplex'
import SerialPort from 'serialport'
import { EventEmitter } from 'stream'
import { NoResponse, FixedLengthResponse, InterByteTimeoutResponse } from './PacketSpecs'

interface SerialPortConfig {
    path: string
    options: SerialPort.OpenOptions
}

class SpeeduinoCommRaw extends EventEmitter  {
    private conn: PacketisedHalfDuplex
    private openFunc: (cb?: (error?: Error | null | undefined) => void) => void
    private closeFunc: () => void

    constructor(dev: PacketisedHalfDuplex | SerialPortConfig) {
        super()

        if (dev instanceof PacketisedHalfDuplex) {
            this.conn = dev
            this.openFunc = (cb) => cb ? cb() : null
            this.closeFunc = () => {}
        } else {
            dev.options.autoOpen = false
            const sp = new SerialPort(dev.path, dev.options)
            sp.on('error', () => this.closeFunc() )
            sp.on('error', (...args) => this.emit('error', args))
            const conn = new PacketisedHalfDuplex(sp)
            conn.on('unexpected', (...args) => this.emit('unexpected', args))
            this.conn = conn

            this.openFunc = (cb) => sp.open(cb)
            this.closeFunc = () => sp.close()
        }
    }

    open(cb?: (error?: Error | null | undefined) => void) {
        this.openFunc(cb)
    }

    async writeAndCloseIfError(cmd: Buffer, psp: PacketSpecPromise): Promise<Buffer> {
        let ret = this.conn.write(cmd, psp)
        ret.catch(() => this.closeFunc())
        return ret
    }

    async signature(): Promise<Buffer> {
        return this.writeAndCloseIfError(Buffer.from('Q'), new InterByteTimeoutResponse(300))
    }

    async versionInfo(): Promise<Buffer> {
        return this.writeAndCloseIfError(Buffer.from('S'), new InterByteTimeoutResponse(300))
    }

    async setCurrentPage(pageNumber: number) {
        let req = Buffer.alloc(2)
        req.writeUInt8(0x50, 0)
        req.writeUInt8(pageNumber, 1)
        return this.writeAndCloseIfError(req, new NoResponse())
    }

    async getCurrentPage(): Promise<Buffer> {
        return this.writeAndCloseIfError(Buffer.from('L'), new InterByteTimeoutResponse(300))
    }

    async loopsPerSecond(): Promise<Buffer> {
        return this.writeAndCloseIfError(Buffer.from('c'), new FixedLengthResponse(2))
    }

    async serialProtocolVersion(): Promise<Buffer> {
        return this.writeAndCloseIfError(Buffer.from('F'), new InterByteTimeoutResponse(300))
    }

    async freeRAM(): Promise<Buffer> {
        return this.writeAndCloseIfError(Buffer.from('m'), new FixedLengthResponse(2))
    }

    async outputChannels(length: number, canId: number = 0, cmd: number = 0x30, offset: number = 0): Promise<Buffer> {
        let req = new ArrayBuffer(7)
        let reqView = new DataView(req)
        reqView.setUint8(0, 0x72) // r
        reqView.setUint8(1, canId)
        reqView.setUint8(2, cmd)
        reqView.setUint16(3, offset, true)
        reqView.setUint16(5, length, true)
        let buf = Buffer.from(req)
        return this.writeAndCloseIfError(buf, new FixedLengthResponse(length))
    }

}

export class SpeeduinoComm {
    raw: SpeeduinoCommRaw

    constructor(dev: PacketisedHalfDuplex | SerialPortConfig) {
        this.raw = new SpeeduinoCommRaw(dev)
    }

    open(cb?: (error?: Error | null | undefined) => void) {
        this.raw.open(cb)
    }

    async signature(): Promise<string> {
        return this.raw.signature().then(r => r.toString('ascii'))
    }

    async versionInfo(): Promise<string> {
        return this.raw.versionInfo().then(r => r.toString('ascii'))
    }

    async setCurrentPage(pageNumber: number) {
        return this.raw.setCurrentPage(pageNumber)
    }

    async getCurrentPage(): Promise<string> {
        return this.raw.getCurrentPage().then(r => r.toString('ascii'))
    }

    async loopsPerSecond(): Promise<number> {
        return this.raw.loopsPerSecond().then(r => (r[1] << 8) + r[0])
    }

    async serialProtocolVersion(): Promise<string> {
        return this.raw.serialProtocolVersion().then(r => r.toString('ascii'))
    }

    async freeRAM(): Promise<number> {
        return this.raw.freeRAM().then(r => (r[1] << 8) + r[0])
    }

    async rawCommand(cmd: Buffer, psp: PacketSpecPromise): Promise<Buffer> {
        return this.raw.writeAndCloseIfError(cmd, psp);
    }
}