import { IsNotEmpty, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class StartLinkDto {
  // What the person will see on their phone: "Chrome on Windows", "Ada's laptop".
  @IsString()
  @Length(1, 100)
  deviceName: string;
}

export class LinkSecretDto {
  @IsUUID()
  linkId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  secret: string;
}
