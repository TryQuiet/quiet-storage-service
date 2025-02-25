/**
 * NOTE: This was an old implementation.  I only kept it around as a reference but I don't expect this to remain in this form.
 */

import { IsString, IsArray } from 'class-validator'

export class InvitationDTO {
  @IsString()
  // @ts-expect-error Initialized but not here
  id: string

  @IsString()
  // @ts-expect-error Initialized but not here
  rootCa: string

  @IsString()
  // @ts-expect-error Initialized but not here
  ownerCertificate: string

  @IsString()
  // @ts-expect-error Initialized but not here
  ownerOrbitDbIdentity: string

  @IsArray()
  @IsString({ each: true })
  // @ts-expect-error Initialized but not here
  peerList: string[]
}
