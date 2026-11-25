import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequestValidationError } from '../../../shared/http/validation';
import {
  type AuthenticatedSession,
  CurrentSession,
  ReporterIdentity,
  Roles,
  SessionGuard,
} from '../../identity';
import {
  DecideStoreProposal,
  InvalidProposalNoteError,
  StoreProposalNotFoundError,
} from '../application/decide-store-proposal';
import {
  DecideStoreCorrection,
  StoreCorrectionNotFoundError,
} from '../application/decide-store-correction';
import type { ProposalClaim } from '../application/proposal-claims';
import { ProposeStore } from '../application/propose-store';
import {
  type StoreCorrectionItem,
  StoreCorrectionsQueue,
} from '../application/store-corrections-queue';
import { StoreProposalsQueue } from '../application/store-proposals-queue';
import { StoreProposalDecisionDto, StoreProposalDto } from './store-proposals.dto';

// Forma de cada elemento de GET /v1/moderation/store-proposals; nunca quién propuso (EC-08).
interface StoreProposalResponse {
  kind: 'tienda';
  id: string;
  name: string;
  type: string;
  address?: string;
  lat: number;
  lng: number;
  municipality: string;
  outOfZone: boolean;
  possibleDuplicates: { id: string; name: string; distanceM: number }[];
  createdAt: string;
  claim?: ProposalClaim;
}

// D5 (#207): una corrección de nombre o ubicación en la misma cola; nunca quién la pidió (EC-08).
type StoreCorrectionResponse = Omit<StoreCorrectionItem, 'createdAt'> & { createdAt: string };

// RF-005 (grill de la #27): un reportante propone una tienda y un moderador la decide.
@Controller()
export class StoreProposalsController {
  constructor(
    private readonly proposeStore: ProposeStore,
    private readonly queue: StoreProposalsQueue,
    private readonly decideProposal: DecideStoreProposal,
    private readonly identities: ReporterIdentity,
    private readonly corrections: StoreCorrectionsQueue,
    private readonly decideCorrection: DecideStoreCorrection,
  ) {}

  @Post('establishment-proposals')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(SessionGuard)
  @Roles('reportante')
  async propose(
    @Body() body: StoreProposalDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<{ id: string; status: 'pendiente' }> {
    // EC-08: establishments solo guarda la clave seudónima de quien propone.
    const { reporterKey } = await this.identities.of(session.accountId);
    return this.proposeStore.execute({
      name: body.name,
      type: body.type,
      lat: body.lat,
      lng: body.lng,
      municipality: body.municipality,
      ...(body.address === undefined ? {} : { address: body.address }),
      proposerKey: reporterKey,
    });
  }

  @Get('moderation/store-proposals')
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  @Roles('moderador')
  async list(): Promise<{ items: (StoreProposalResponse | StoreCorrectionResponse)[] }> {
    // D5 (#207): las propuestas y las correcciones, juntas y la más antigua primero.
    const items = [
      ...(await this.queue.list()).map((item) => ({ kind: 'tienda' as const, ...item })),
      ...(await this.corrections.list()),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return { items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) };
  }

  @Post('moderation/store-proposals/:proposalId/decision')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  @Roles('moderador')
  async decide(
    @Param(
      'proposalId',
      new ParseUUIDPipe({
        exceptionFactory: () => new RequestValidationError('proposalId: debe ser un UUID'),
      }),
    )
    proposalId: string,
    @Body() body: StoreProposalDecisionDto,
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<void> {
    const { reporterKey } = await this.identities.of(session.accountId);
    try {
      await this.decideProposal.execute({
        proposalId,
        decision: body.decision,
        ...(body.mergeInto === undefined ? {} : { mergeInto: body.mergeInto }),
        note: body.note,
        moderatorKey: reporterKey,
      });
    } catch (error) {
      // D5 (#207): el id puede ser de una corrección, que se aprueba o se rechaza (no se fusiona).
      if (error instanceof StoreProposalNotFoundError && body.decision !== 'fusionar') {
        await this.decideCorrectionOr404(proposalId, body.decision, body.note, reporterKey);
        return;
      }
      if (error instanceof StoreProposalNotFoundError) throw new NotFoundException();
      // El DTO mide el texto tal cual; el caso de uso, sin los espacios de los extremos.
      if (error instanceof InvalidProposalNoteError) {
        throw new RequestValidationError(`note: ${error.message}`);
      }
      throw error;
    }
  }

  private async decideCorrectionOr404(
    correctionId: string,
    decision: 'aprobar' | 'rechazar',
    note: string,
    moderatorKey: string,
  ): Promise<void> {
    try {
      await this.decideCorrection.execute({ correctionId, decision, note, moderatorKey });
    } catch (error) {
      if (error instanceof StoreCorrectionNotFoundError) throw new NotFoundException();
      throw error;
    }
  }
}
