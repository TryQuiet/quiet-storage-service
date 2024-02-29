import { IsString, IsArray } from 'class-validator';

export class InvitationDTO {
  @IsString()
  id: string;

  @IsString()
  rootCa: string;

  @IsString()
  ownerCertificate: string;

  @IsString()
  ownerOrbitDbIdentity: string;

  @IsArray()
  @IsString({ each: true })
  peerList: string[];
}
