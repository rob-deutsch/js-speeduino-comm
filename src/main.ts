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

console.log("Initial run");
SerialPort.list().then(async (ports) => {
    for (let idx in ports) {
        const port = ports[idx]
        console.log(`[${idx}]: ${port.path}`)
    }
    const choice = await prompt.get(['id'])
    const port = ports[parseInt(choice['id'] as string)]

    const sp = new SerialPort(port.path, {baudRate: 115200, autoOpen: false})
    sp.pipe(new HexTransformer()).pipe(process.stdout)
    sp.open((err) => {
        if (err) throw err
        sp.write('S')
        // sp.write(Buffer.from([0x72, 0x00, 0x30, 0x00, 0x00, 0x72, 0x00]))
    })
})