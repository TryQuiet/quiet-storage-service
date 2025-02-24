import { IsString } from 'class-validator'

export class CreateCommunityDto {
  @IsString()
  // @ts-expect-error Initialized but not here
  public readonly id: string

  @IsString()
  // @ts-expect-error Initialized but not here
  public readonly name: string
}
