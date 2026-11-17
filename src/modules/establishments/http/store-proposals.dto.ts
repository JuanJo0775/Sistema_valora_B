import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { type Municipality, MUNICIPALITY_CODES } from '../../../domain/municipality';
import { PROPOSAL_NOTE_LENGTH } from '../application/decide-store-proposal';
import type { EstablishmentType } from '../application/establishment-repository';
import type { StoreProposalDecision } from '../application/store-proposals';

const TYPES: EstablishmentType[] = ['barrio', 'minimercado', 'supermercado', 'descuento'];
const DECISIONS: StoreProposalDecision[] = ['aprobar', 'fusionar', 'rechazar'];
const NOTE_MESSAGE = `debe tener de ${String(PROPOSAL_NOTE_LENGTH.min)} a ${String(PROPOSAL_NOTE_LENGTH.max)} caracteres`;

// Cuerpo de POST /v1/establishment-proposals (contrato de la #27).
export class StoreProposalDto {
  @IsString({ message: 'debe tener de 2 a 120 caracteres' })
  @Length(2, 120, { message: 'debe tener de 2 a 120 caracteres' })
  name!: string;

  @IsIn(TYPES, { message: 'debe ser barrio, minimercado, supermercado o descuento' })
  type!: EstablishmentType;

  @IsLatitude({ message: 'debe estar entre -90 y 90' })
  lat!: number;

  @IsLongitude({ message: 'debe estar entre -180 y 180' })
  lng!: number;

  // Grill de la #106: uno de los 12 municipios del Quindío.
  @IsIn(MUNICIPALITY_CODES, { message: 'debe ser un municipio del Quindío' })
  municipality!: Municipality;

  @IsOptional()
  @IsString({ message: 'debe tener como máximo 200 caracteres' })
  @MaxLength(200, { message: 'debe tener como máximo 200 caracteres' })
  address?: string;
}

// Cuerpo de POST /v1/moderation/store-proposals/{proposalId}/decision.
export class StoreProposalDecisionDto {
  @IsIn(DECISIONS, { message: 'debe ser aprobar, fusionar o rechazar' })
  decision!: StoreProposalDecision;

  @IsString({ message: NOTE_MESSAGE })
  @Length(PROPOSAL_NOTE_LENGTH.min, PROPOSAL_NOTE_LENGTH.max, { message: NOTE_MESSAGE })
  note!: string;

  // Solo y siempre con fusionar.
  @ValidateIf((dto: StoreProposalDecisionDto) => dto.decision === 'fusionar')
  @IsUUID('all', { message: 'debe ser un UUID; es obligatorio al fusionar' })
  mergeInto?: string;
}
