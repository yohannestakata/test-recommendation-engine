import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { spawn } from 'child_process';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  async generateEmbedding(text: string): Promise<number[]> {
    const pythonExec = process.env.PYTHON_EXECUTABLE || 'python';

    return new Promise((resolve, reject) => {
      const child = spawn(pythonExec, ['embeddings/generate_embedding.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          this.logger.error(`Embedding process failed: ${errorOutput}`);
          reject(new InternalServerErrorException('Failed to generate embedding'));
          return;
        }

        try {
          const parsed = JSON.parse(output);
          resolve(parsed);
        } catch (err) {
          this.logger.error('Failed to parse embedding output', err as Error);
          reject(new InternalServerErrorException('Failed to parse embedding output'));
        }
      });

      child.stdin.write(text);
      child.stdin.end();
    });
  }
}


