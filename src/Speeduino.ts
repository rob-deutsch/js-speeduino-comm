import { PacketisedHalfDuplex, PacketSpecPromise } from './PacketisedHalfDuplex'
import SerialPort from 'serialport'
import { EventEmitter } from 'stream'
import { SResponse, TResponse } from './PacketSpecs'

interface SerialPortConfig {
    path: string
    options: SerialPort.OpenOptions
}

class SpeeduinoRaw extends EventEmitter  {
    private conn: PacketisedHalfDuplex
    private openFunc: (cb?: (error?: Error | null | undefined) => void) => void

    constructor(dev: PacketisedHalfDuplex | SerialPortConfig) {
        super()

        if (dev instanceof PacketisedHalfDuplex) {
            this.conn = dev
            this.openFunc = (cb) => cb ? cb() : null
        } else {
            dev.options.autoOpen = false
            const sp = new SerialPort(dev.path, dev.options)
            sp.on('error', () => sp.close())
            sp.on('error', (...args) => this.emit('error', args))
            const conn = new PacketisedHalfDuplex(sp)
            conn.on('unexpected', (...args) => this.emit('unexpected', args))
            this.conn = conn

            this.openFunc = (cb) => sp.open(cb)
        }
    }

    open(cb?: (error?: Error | null | undefined) => void) {
        this.openFunc(cb)
    }

    async writeWhenOpen(cmd: Buffer, psp: PacketSpecPromise): Promise<Buffer> {
        return this.conn.write(cmd, psp)
    }

    async signature(): Promise<Buffer> {
        return this.conn.write(Buffer.from('Q'), new TResponse(300))
    }

    async versionInfo(): Promise<Buffer> {
        return this.conn.write(Buffer.from('S'), new TResponse(300))
    }

    async outputChannels(length: number, canId: number = 0, cmd: number = 0x30, offset: number = 0): Promise<Buffer> {
        let req = new ArrayBuffer(7)
        let reqView = new DataView(req)
        reqView.setUint8(0, 0x72)
        reqView.setUint8(1, canId)
        reqView.setUint8(2, cmd)
        reqView.setUint16(3, offset, true)
        reqView.setUint16(5, length, true)
        let buf = Buffer.from(req)
        return this.conn.write(buf, new SResponse(length))
    }

}

export class Speeduino extends EventEmitter {
    raw: SpeeduinoRaw

    constructor(dev: PacketisedHalfDuplex | SerialPortConfig) {
        super()

        this.raw = new SpeeduinoRaw(dev)
        this.raw.on('error', (...args) => this.emit('error', args))
        this.raw.on('unexpected', (...args) => this.emit('unexpected', args))
    }

    async signature(): Promise<string> {
        return this.raw.signature().then(r => r.toString('ascii'))
    }

    async versionInfo(): Promise<string> {
        return this.raw.versionInfo().then(r => r.toString('ascii'))
    }

    async rawCommand(cmd: Buffer, psp: PacketSpecPromise): Promise<Buffer> {
        return this.raw.writeWhenOpen(cmd, psp);
    }
}