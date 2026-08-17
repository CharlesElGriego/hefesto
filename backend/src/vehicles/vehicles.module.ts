import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vehicle, VehicleSchema } from './schemas/vehicle.schema';
import {
  MaintenanceRecord,
  MaintenanceRecordSchema,
} from './schemas/maintenance-record.schema';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';

/** Vehicles domain: Mongoose schemas, CRUD service, dashboard aggregations. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Vehicle.name, schema: VehicleSchema },
      { name: MaintenanceRecord.name, schema: MaintenanceRecordSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
  ],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
