import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';

const HOOPSS_SPAWN_URL = process.env.HOOPSS_SPAWN_URL || 'http://localhost:11182';
const HOOPSS_WS_HOST = process.env.HOOPSS_WS_HOST || 'localhost';

export interface SpawnResult {
  sessionId: string;
  endpointUri: string;
  status: 'ready';
}

@Injectable()
export class SpawnService {
  /**
   * HOOPS Spawn Server /service (broker) API를 호출하고
   * requirements 스펙 형태로 변환하여 반환합니다.
   */
  async spawn(modelId: string, rendererType: 'csr' | 'ssr'): Promise<SpawnResult> {
    const serviceClass = rendererType === 'ssr' ? 'ssr_session' : 'csr_session';
    let response;
    try {
      response = await axios.post(
        `${HOOPSS_SPAWN_URL}/service`,
        {
          class: serviceClass,
          params: {
            model: modelId || undefined,
          },
        },
        {
          timeout: 60000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: () => true,
        },
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('ENOENT') || msg.includes('ts3d_sc_server')) {
        throw new ServiceUnavailableException(
          '스트리밍 서버(ts3d_sc_server)를 시작할 수 없습니다. .env의 HOOPSS_PACKAGE_PATH가 HOOPS 패키지 루트를 가리키는지 확인하고, docker compose down 후 docker compose up --build 로 hoops-spawn을 재시작하세요.',
        );
      }
      throw err;
    }

    const { data } = response;

    if (data.result !== 'ok' || !data.endpoints?.ws) {
      const reason = data.reason || 'Spawn failed';
      const friendly =
        reason.includes('ENOENT') || reason.includes('ts3d_sc_server')
          ? '스트리밍 서버 실행 파일을 찾을 수 없습니다. .env에 HOOPSS_PACKAGE_PATH를 설정한 뒤 docker compose down 후 docker compose up --build 를 실행하세요.'
          : reason;
      throw new ServiceUnavailableException(friendly);
    }

    const wsUrl = data.endpoints.ws as string;
    const endpointUri = this.rewriteWsHost(wsUrl);

    return {
      sessionId: data.serviceId,
      endpointUri,
      status: 'ready',
    };
  }

  private rewriteWsHost(wsUrl: string): string {
    try {
      const u = new URL(wsUrl);
      u.hostname = HOOPSS_WS_HOST;
      return u.toString();
    } catch {
      return wsUrl;
    }
  }
}
