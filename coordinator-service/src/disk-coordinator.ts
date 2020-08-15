import fs from 'fs'
import {
    Ceremony,
    ChunkStorage,
    Coordinator,
    LockedChunkData,
} from './coordinator'

interface DiskCoordinatorConfig {
    chunks: { chunkId: string; location: string }[]
    participantIds: string[]
}

export class DiskCoordinator implements Coordinator {
    dbPath: string
    chunkStorage: ChunkStorage

    static init({
        config,
        dbPath,
    }: {
        config: DiskCoordinatorConfig
        dbPath: string
    }): void {
        const ceremony = {
            chunks: config.chunks.map((configChunk) => ({
                chunkId: configChunk.chunkId,
                contributions: [
                    {
                        location: configChunk.location,
                        participantId: '0',
                    },
                ],
                holder: null,
            })),
            participantIds: config.participantIds,
        }
        fs.writeFileSync(dbPath, JSON.stringify(ceremony, null, 2))
    }

    constructor({
        chunkStorage,
        dbPath,
    }: {
        chunkStorage: ChunkStorage
        dbPath: string
    }) {
        this.dbPath = dbPath
        this.chunkStorage = chunkStorage
    }

    _readDb(): Ceremony {
        return JSON.parse(fs.readFileSync(this.dbPath).toString())
    }

    _writeDb(ceremony: Ceremony): void {
        fs.writeFileSync(this.dbPath, JSON.stringify(ceremony, null, 2))
    }

    getCeremony(): Ceremony {
        return this._readDb()
    }

    static _getChunk(ceremony: Ceremony, chunkId: string): LockedChunkData {
        const chunk = ceremony.chunks.find((chunk) => chunk.chunkId == chunkId)
        if (!chunk) {
            throw new Error(`Unknown chunkId ${chunkId}`)
        }
        return chunk
    }

    tryLockChunk(chunkId: string, participantId: string): boolean {
        const ceremony = this._readDb()
        const chunk = DiskCoordinator._getChunk(ceremony, chunkId)
        if (chunk.holder) {
            return false
        }
        chunk.holder = participantId
        this._writeDb(ceremony)
        return true
    }

    async contributeChunk(
        chunkId: string,
        participantId: string,
        content: string,
    ): Promise<void> {
        const ceremony = this._readDb()
        const chunk = DiskCoordinator._getChunk(ceremony, chunkId)
        if (
            chunk.contributions.find(
                (contribution) => contribution.participantId === participantId,
            )
        ) {
            throw new Error(
                `Participant ${participantId} already contributed ` +
                    `to chunk ${chunkId}`,
            )
        }
        if (chunk.holder !== participantId) {
            throw new Error(
                `Participant ${participantId} does not hold lock ` +
                    `on chunk ${chunkId}`,
            )
        }
        const location = await this.chunkStorage.setChunk(
            chunkId,
            participantId,
            content,
        )
        chunk.contributions.push({
            location,
            participantId,
        })
        chunk.holder = null
        this._writeDb(ceremony)
    }
}
