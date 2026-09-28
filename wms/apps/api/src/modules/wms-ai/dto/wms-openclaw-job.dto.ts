import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
// FIX: client supplies opaque job/conversation IDs; actor identity comes from authentication.
export class WmsOpenClawJobDto {
  @IsUUID() requestId!: string;
  @IsUUID() conversationId!: string;
  @IsString() @MinLength(2) @MaxLength(4000) message!: string;
}
