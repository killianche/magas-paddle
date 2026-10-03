import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubService } from '../club';
import { colorOf } from './look';

@Controller('courts')
export class CourtsController {
  constructor(
    private readonly db: PrismaService,
    private readonly club: ClubService,
  ) {}

  /** Площадки, которые показываются в приложении.
   *  Выключенные (is_active = false) не отдаются вовсе — так просил клуб. */
  @Get()
  async list() {
    const set = await this.club.get();
    const courts = await this.db.courts.findMany({
      where: { is_active: true },
      orderBy: { sort_order: 'asc' },
      include: { court_photos: { orderBy: [{ sort: 'asc' }, { id: 'asc' }] } },
    });
    return courts.map(c => ({
      // Снимки, загруженные клубом; пусто — приложение покажет временные
      photos: c.court_photos.map(ph => ph.url),
      id: c.id,
      name: c.name,
      isFootball: c.is_football,
      isFamily: c.is_family,
      description: c.description,
      color: colorOf(c.color),
      tags: c.tags,
      priceMorning: c.price_morning,
      priceStandard: c.price_standard,
      morningUntil: set.morningUntil,
      closedUntil: c.closed_until,
      closedReason: c.closed_reason,
    }));
  }

}

/** Прокат и мячи для приложения: то, что клиент может отметить при записи.
 *  Бар и прочее сюда не попадают — их продают на стойке (заказчик 04.10.2026).
 *  Цены и остатки берутся из того же каталога, которым пользуется касса. */
@Controller('goods')
export class GoodsController {
  constructor(private readonly db: PrismaService, private readonly club: ClubService) {}

  @Get()
  async list() {
    if (!(await this.club.get()).salesOn) return [];
    const rows = await this.db.products.findMany({
      where: { is_active: true, category: { in: ['rental', 'shop'] } },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    return rows
      // Товар, которого нет на складе, не предлагаем: прокат не кончается
      .filter(p => p.category === 'rental' || p.stock == null || p.stock > 0)
      .map(p => ({
        id: Number(p.id), name: p.name, category: p.category, price: p.price,
        photoUrl: p.photo_url,
        // Сколько ещё можно взять; у проката ограничения нет
        left: p.category === 'rental' ? null : p.stock,
      }));
  }
}

/** Всё о ценах разом: обычные тарифы площадок и особые цены.
 *  Нужен прайс-листу в приложении: без правил он показывал бы одну цену,
 *  а человек в субботу видел бы в сетке другую. */
@Controller('prices')
export class PricesController {
  constructor(
    private readonly db: PrismaService,
    private readonly club: ClubService,
  ) {}

  @Get()
  async prices() {
    const [courts, pricing] = await Promise.all([
      this.db.courts.findMany({ where: { is_active: true }, orderBy: { sort_order: 'asc' } }),
      this.club.pricing(),
    ]);
    return {
      openHour: pricing.settings.openHour,
      closeHour: pricing.settings.closeHour,
      morningUntil: pricing.settings.morningUntil,
      cancelHours: pricing.settings.cancelHours,
      courts: courts.map(c => ({
        id: c.id, name: c.name, isFootball: c.is_football,
        priceMorning: c.price_morning, priceStandard: c.price_standard,
      })),
      rules: pricing.rules.map(r => ({
        id: r.id, courtId: r.courtId, days: r.days,
        fromHour: r.fromHour, toHour: r.toHour, price: r.price, note: r.note,
      })),
    };
  }
}


/** Контакты и режим клуба для приложения.
 *
 *  Отдельным запросом, а не внутри расписания: экраны с контактами открывают
 *  реже, чем сетку, а меняются они редко — приложение кэширует ответ.
 *  Меняет их менеджер из админки, новой сборки для этого не нужно.
 */
@Controller('club')
export class ClubController {
  constructor(private readonly club: ClubService) {}

  @Get()
  async info() {
    const s = await this.club.get();
    return {
      openHour: s.openHour,
      closeHour: s.closeHour,
      /** Часы по дням недели, с понедельника: { open, close, closed }. */
      week: s.week,
      cancelHours: s.cancelHours,
      holdMinutes: s.holdMinutes,
      phone: s.phone,
      whatsapp: s.whatsapp,
      address: s.address,
      mapUrl: s.mapUrl,
      instagram: s.instagram,
      telegram: s.telegram,
      prepayPercent: s.prepayPercent,
      lateMinutes: s.lateMinutes,
      rentalsText: s.rentalsText,
      showTournaments: s.showTournaments,
      showFootball: s.showFootball,
      coachesOn: s.coachesOn,
      familyOn: s.familyOn,
      waTemplate: s.waTemplate,
      bookingNote: s.bookingNote,
      heroUrl: s.heroUrl,
      heroLightUrl: s.heroLightUrl,
    };
  }
}
