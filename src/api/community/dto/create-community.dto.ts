import { IsString } from 'class-validator'

export class CreateCommunityDto {
  @IsString()
  public readonly id: string

  @IsString()
  public readonly name: string
}
