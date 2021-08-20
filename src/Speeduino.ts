import { PacketisedHalfDuplex, PacketSpecPromise } from './PacketisedHalfDuplex'



import { SResponse, TResponse } from './PacketSpecs'
import SerialPort from 'serialport'
import { EventEmitter } from 'stream'

interface SerialPortConfig {
    path: string
    options: SerialPort.OpenOptions
}

class SpeeduinoRaw {
    conn: PacketisedHalfDuplex
    
    constructor(conn: PacketisedHalfDuplex) {
        this.conn = conn
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

export class Speeduino {
    raw: SpeeduinoRaw
    private conn: PacketisedHalfDuplex

    constructor(conn: PacketisedHalfDuplex) {
        this.conn = conn
        this.raw = new SpeeduinoRaw(conn)
    }

    async signature(): Promise<string> {
        return this.raw.signature().then(r => r.toString('ascii'))
    }

    async versionInfo(): Promise<string> {
        return this.raw.versionInfo().then(r => r.toString('ascii'))
    }

    async rawCommand(cmd: Buffer, psp: PacketSpecPromise): Promise<Buffer> {
        return this.conn.write(cmd, psp);
    }
}