import { EventEmitter } from 'stream'
import { Duplex } from 'stream';
import { ArbPacketParser, PacketSpec } from './ArbPacketParser'

export interface PacketSpecPromise extends PacketSpec {
    getValue(): Promise<Buffer>
}

export class HalfDuplexPackets extends EventEmitter {
    conn: Duplex
    parser: ArbPacketParser
    lastPromise: Promise<any>
    commandTimeout: number
    pauseBetweenCommands: number

    constructor(conn: Duplex, commandTimeout: number = 1000, pauseBetweenCommands: number = 10) {
        super()
        this.pauseBetweenCommands = pauseBetweenCommands
        this.commandTimeout = commandTimeout
        this.conn = conn
        // this.sp.pipe(new HexTransformer).pipe(process.stdout)
        this.parser = this.conn.pipe(new ArbPacketParser)
        this.parser.on('unexpected', (data) => this.emit('unexpected', data))
        this.lastPromise = new Promise<void>(resolve => resolve())
    }

    async sendCommand(cmd: Buffer, rp: PacketSpecPromise): Promise<Buffer> {
        // When the previous promise completes then send the next command
        this.lastPromise.finally(() => {
            this.parser.newPacketSpec(rp)
            this.conn.write(cmd)
            setTimeout(() => rp.timeout(), this.commandTimeout)
        })
        // Define the ending condition of the last command
        let promiseToWait = () => { return new Promise(resolve => setTimeout(resolve, this.pauseBetweenCommands)) }
        this.lastPromise = rp.getValue().catch(() => {}).finally(() => promiseToWait())
        
        return rp.getValue()
    }
}