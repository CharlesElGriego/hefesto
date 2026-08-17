import { Injectable } from '@angular/core';

/** Supported UI languages. */
export type Lang = 'en' | 'es';

/**
 * Featherweight on-device i18n: the UI chrome follows the browser language
 * (assistant replies already follow the language of each message).
 */
const DICT: Record<Lang, Record<string, string>> = {
  en: {
    'nav.chat': 'Chat',
    'nav.panel': 'Panel',
    'nav.garage': 'Garage',
    'nav.connect': 'Connect',

    'chat.emptyTitle': 'Tell me what you did to the car.',
    'chat.emptySub':
      'I turn it into a service record — no forms. You can also ask me anything about your history.',
    'chat.placeholder': 'e.g. changed the oil, $45 at 62,400 km',
    'chat.send': 'Send message',
    'chat.typing': 'Hefesto is typing',
    'chat.online': 'online',
    'chat.netError':
      "I couldn't reach the server. Check the connection and try again — nothing was saved.",

    'card.loggedBy': 'Logged by Hefesto · {pct}% confident',

    'dash.failed': "Couldn't load the dashboard. Check that the server is running and reload.",
    'dash.emptyTitle': 'Nothing logged yet.',
    'dash.emptyBody':
      'Tell Hefesto about your last service in the chat — one sentence is enough — and your timeline, spending, and upcoming services will build themselves here.',
    'dash.openChat': 'Open the chat',
    'dash.upNext': 'Up next',
    'dash.dueNow': 'due now',
    'dash.spending': 'Spending',
    'dash.garage': 'Your garage',
    'dash.car': 'car',
    'dash.cars': 'cars',
    'dash.byCar': 'Spending by car',
    'dash.total': 'Total spent',
    'dash.lastOne': 'Last: {date}',
    'up.oil_change': 'Oil change',
    'up.tires': 'Tire rotation',
    'up.brakes': 'Brake check',
    'up.battery': 'Battery replacement',
    'up.inspection': 'Inspection',
    'dash.across': 'across {n} {records}',
    'dash.recent': 'Recent',
    'dash.or': 'or',
    'dash.record': 'record',
    'dash.records': 'records',

    'dlg.deleteVehicleTitle': 'Delete vehicle?',
    'dlg.deleteVehicleMsg': 'This permanently deletes {name} and its entire service history.',
    'dlg.deleteRecordTitle': 'Delete record?',
    'dlg.deleteRecordMsg': 'This permanently deletes “{name}”.',
    'dlg.delete': 'Delete',
    'err.required': 'Required',
    'err.year': 'Enter a valid year',
    'err.nonneg': 'Must be 0 or more',
    'err.tooLong': 'Too long',
    'err.future': "Can't be in the future",
    'g.title': 'Garage',
    'g.addVehicle': '+ Add vehicle',
    'g.make': 'Make',
    'g.model': 'Model',
    'g.year': 'Year',
    'g.plate': 'Plate',
    'g.mileage': 'Current mileage (km)',
    'g.optional': 'optional',
    'g.cancel': 'Cancel',
    'g.save': 'Save',
    'g.addVehicleSubmit': 'Add vehicle',
    'g.history': 'History',
    'g.back': 'Garage',
    'g.addManually': '+ Add manually',
    'g.what': 'What was done',
    'g.whatPh': 'e.g. Front brake pads replaced',
    'g.type': 'Type',
    'g.date': 'Date',
    'g.cost': 'Cost ($)',
    'g.km': 'Mileage (km)',
    'g.workshop': 'Workshop',
    'g.addRecord': 'Add record',
    'g.saveChanges': 'Save changes',
    'g.deleteQ': 'Delete?',
    'g.deleteCarQ': 'Delete car + history?',
    'g.yes': 'Yes',
    'g.no': 'No',
    'g.noRecords':
      'No services logged for this car yet. Tell Hefesto in the chat, or add one manually.',
    'g.selectAria': 'Select',
    'g.editV': 'Edit vehicle',
    'g.delV': 'Delete vehicle',
    'g.editR': 'Edit record',
    'g.delR': 'Delete record',
    'src.manual': 'manual',
    'src.chat': 'via chat',
    'src.whatsapp': 'via WhatsApp',
    'type.oil_change': 'Oil change',
    'type.tires': 'Tires',
    'type.brakes': 'Brakes',
    'type.battery': 'Battery',
    'type.inspection': 'Inspection',
    'type.repair': 'Repair',
    'type.other': 'Other',

    'c.connectedAs': 'Connected as +{number}',
    'c.answersHere': 'Hefesto now answers on this WhatsApp account.',
    'c.disconnect': 'Disconnect',
    'c.howTitle': 'How to talk to Hefesto now:',
    'c.selfTitle': 'From this same account',
    'c.selfBody': 'open WhatsApp and use "Message yourself"; Hefesto replies right in that chat.',
    'c.whoTitle': 'Who can talk to Hefesto',
    'c.selfAlways': 'The self-chat of this account — always.',
    'c.allowedHint':
      'Anyone else must be authorized here first. Unknown numbers, groups, channels, and other bots get silence.',
    'c.noneAllowed': 'No extra numbers authorized yet.',
    'c.addPh': 'Number with country code, e.g. 50688881111',
    'c.add': 'Authorize',
    'c.removeAria': 'De-authorize',
    'c.syncNote':
      'Everything logged here appears instantly in the web dashboard too — same brain, two channels.',
    'c.scanBody': 'Scan with the phone that will host Hefesto:',
    'c.scanPath': 'WhatsApp → Settings → Linked devices → Link a device',
    'c.qrRefresh': 'The code refreshes automatically every few seconds.',
    'c.cancel': 'Cancel',
    'c.preparing': 'Preparing the QR code…',
    'c.pitch':
      'Link a WhatsApp account and Hefesto lives in your pocket — log maintenance and ask about your car without opening this site again.',
    'c.twoWays': 'Two ways to use it',
    'c.spareTitle': 'Spare number',
    'c.spareBody': "scan with a secondary phone; that number becomes your assistant's contact.",
    'c.ownTitle': 'Your own number',
    'c.ownBody': 'scan with your main phone and talk to Hefesto in the "Message yourself" chat.',
    'c.cta': 'Connect WhatsApp',
    'c.tos':
      'Uses the unofficial WhatsApp Web protocol (Baileys) — fine for this prototype; a production build would use the WhatsApp Business Cloud API.',
    'c.qrAlt': 'WhatsApp QR code',
  },
  es: {
    'nav.chat': 'Chat',
    'nav.panel': 'Panel',
    'nav.garage': 'Garaje',
    'nav.connect': 'Conectar',

    'chat.emptyTitle': 'Cuéntame qué le hiciste al carro.',
    'chat.emptySub':
      'Lo convierto en un registro de servicio — sin formularios. También puedes preguntarme lo que sea de tu historial.',
    'chat.placeholder': 'ej: cambié el aceite, $45 a 62.400 km',
    'chat.send': 'Enviar mensaje',
    'chat.typing': 'Hefesto está escribiendo',
    'chat.online': 'en línea',
    'chat.netError':
      'No pude conectar con el servidor. Revisa la conexión e intenta de nuevo — no se guardó nada.',

    'card.loggedBy': 'Registrado por Hefesto · {pct}% de confianza',

    'dash.failed': 'No se pudo cargar el panel. Verifica que el servidor esté corriendo y recarga.',
    'dash.emptyTitle': 'Aún no hay nada registrado.',
    'dash.emptyBody':
      'Cuéntale a Hefesto tu último servicio en el chat — con una frase basta — y tu línea de tiempo, gastos y próximos servicios se arman solos aquí.',
    'dash.openChat': 'Abrir el chat',
    'dash.upNext': 'Próximos',
    'dash.dueNow': 'toca ya',
    'dash.spending': 'Gastos',
    'dash.garage': 'Tu garaje',
    'dash.car': 'carro',
    'dash.cars': 'carros',
    'dash.byCar': 'Gasto por carro',
    'dash.total': 'Gasto total',
    'dash.lastOne': 'Último: {date}',
    'up.oil_change': 'Cambio de aceite',
    'up.tires': 'Rotación de cauchos',
    'up.brakes': 'Revisión de frenos',
    'up.battery': 'Cambio de batería',
    'up.inspection': 'Revisión general',
    'dash.across': 'en {n} {records}',
    'dash.recent': 'Recientes',
    'dash.or': 'o',
    'dash.record': 'registro',
    'dash.records': 'registros',

    'dlg.deleteVehicleTitle': '¿Borrar vehículo?',
    'dlg.deleteVehicleMsg': 'Se eliminará {name} y todo su historial de forma permanente.',
    'dlg.deleteRecordTitle': '¿Borrar registro?',
    'dlg.deleteRecordMsg': 'Se eliminará “{name}” de forma permanente.',
    'dlg.delete': 'Borrar',
    'err.required': 'Obligatorio',
    'err.year': 'Año inválido',
    'err.nonneg': 'Debe ser 0 o más',
    'err.tooLong': 'Muy largo',
    'err.future': 'No puede ser futura',
    'g.title': 'Garaje',
    'g.addVehicle': '+ Agregar vehículo',
    'g.make': 'Marca',
    'g.model': 'Modelo',
    'g.year': 'Año',
    'g.plate': 'Placa',
    'g.mileage': 'Kilometraje actual (km)',
    'g.optional': 'opcional',
    'g.cancel': 'Cancelar',
    'g.save': 'Guardar',
    'g.addVehicleSubmit': 'Agregar vehículo',
    'g.history': 'Historial',
    'g.back': 'Garaje',
    'g.addManually': '+ Agregar manual',
    'g.what': 'Qué se hizo',
    'g.whatPh': 'ej: Cambio de pastillas delanteras',
    'g.type': 'Tipo',
    'g.date': 'Fecha',
    'g.cost': 'Costo ($)',
    'g.km': 'Kilometraje (km)',
    'g.workshop': 'Taller',
    'g.addRecord': 'Agregar registro',
    'g.saveChanges': 'Guardar cambios',
    'g.deleteQ': '¿Borrar?',
    'g.deleteCarQ': '¿Borrar carro e historial?',
    'g.yes': 'Sí',
    'g.no': 'No',
    'g.noRecords':
      'Este carro no tiene servicios registrados aún. Cuéntale a Hefesto en el chat, o agrega uno manual.',
    'g.selectAria': 'Seleccionar',
    'g.editV': 'Editar vehículo',
    'g.delV': 'Borrar vehículo',
    'g.editR': 'Editar registro',
    'g.delR': 'Borrar registro',
    'src.manual': 'manual',
    'src.chat': 'vía chat',
    'src.whatsapp': 'vía WhatsApp',
    'type.oil_change': 'Cambio de aceite',
    'type.tires': 'Cauchos',
    'type.brakes': 'Frenos',
    'type.battery': 'Batería',
    'type.inspection': 'Revisión',
    'type.repair': 'Reparación',
    'type.other': 'Otro',

    'c.connectedAs': 'Conectado como +{number}',
    'c.answersHere': 'Hefesto ya responde en esta cuenta de WhatsApp.',
    'c.disconnect': 'Desconectar',
    'c.howTitle': 'Cómo hablarle a Hefesto ahora:',
    'c.selfTitle': 'Desde esta misma cuenta',
    'c.selfBody': 'abre WhatsApp y usa "Mensaje a ti mismo"; Hefesto responde ahí mismo.',
    'c.whoTitle': 'Quién puede hablarle a Hefesto',
    'c.selfAlways': 'El self-chat de esta cuenta — siempre.',
    'c.allowedHint':
      'Cualquier otro número debe autorizarse aquí primero. Desconocidos, grupos, canales y otros bots reciben silencio.',
    'c.noneAllowed': 'Aún no hay números extra autorizados.',
    'c.addPh': 'Número con código de país, ej: 50688881111',
    'c.add': 'Autorizar',
    'c.removeAria': 'Quitar autorización',
    'c.syncNote':
      'Todo lo registrado ahí aparece al instante en el panel web — mismo cerebro, dos canales.',
    'c.scanBody': 'Escanea con el teléfono que va a hospedar a Hefesto:',
    'c.scanPath': 'WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo',
    'c.qrRefresh': 'El código se refresca solo cada pocos segundos.',
    'c.cancel': 'Cancelar',
    'c.preparing': 'Preparando el código QR…',
    'c.pitch':
      'Vincula una cuenta de WhatsApp y Hefesto vive en tu bolsillo — registra mantenimientos y pregunta por tu carro sin volver a abrir este sitio.',
    'c.twoWays': 'Dos formas de usarlo',
    'c.spareTitle': 'Número de repuesto',
    'c.spareBody':
      'escanea con un teléfono secundario; ese número se convierte en el contacto de tu asistente.',
    'c.ownTitle': 'Tu propio número',
    'c.ownBody':
      'escanea con tu teléfono principal y háblale a Hefesto en el chat "Mensaje a ti mismo".',
    'c.cta': 'Conectar WhatsApp',
    'c.tos':
      'Usa el protocolo no oficial de WhatsApp Web (Baileys) — bien para este prototipo; en producción sería la WhatsApp Business Cloud API.',
    'c.qrAlt': 'Código QR de WhatsApp',
  },
};

/**
 * Featherweight i18n: picks ES/EN from the device language once and serves
 * the static dictionary via t(key, params). No async, no locale files.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang: Lang = navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';

  readonly samples: string[] =
    this.lang === 'es'
      ? [
          'Cambié el aceite y el filtro, $45 a 62.400 km',
          '¿Cuánto he gastado este año?',
          '¿Cuándo fue mi último cambio de aceite?',
        ]
      : [
          'Changed the oil and filter, $45 at 62,400 km',
          'How much have I spent this year?',
          'When was my last oil change?',
        ];

  t(key: string, params?: Record<string, string | number>): string {
    let out = DICT[this.lang][key] ?? DICT.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        out = out.replace(`{${k}}`, String(v));
      }
    }
    return out;
  }
}
