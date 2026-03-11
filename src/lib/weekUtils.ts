import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export interface WeekDay {
  date: Date;
  dateStr: string;
  dayName: string;
  dayShort: string;
  dayNumber: string;
  isToday: boolean;
}

export function getWeekDays(baseDate?: Date): WeekDay[] {
  const referenceDate = baseDate || new Date();
  const currentDay = referenceDate.getDay();
  const mondayOffset = currentDay === 0 ? -6 : -(currentDay - 1);

  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() + mondayOffset);

  const weekDays: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    weekDays.push({
      date: day,
      dateStr: format(day, 'yyyy-MM-dd'),
      dayName: format(day, 'EEEE', { locale: es }),
      dayShort: format(day, 'EEE', { locale: es }),
      dayNumber: format(day, 'dd'),
      isToday: format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'),
    });
  }
  return weekDays;
}

export function getWeekRange(baseDate?: Date): string {
  const weekDays = getWeekDays(baseDate);
  const startDate = weekDays[0].date;
  const endDate = weekDays[6].date;
  const startFormatted = format(startDate, "dd 'de' MMMM", { locale: es });
  const endFormatted = format(endDate, "dd 'de' MMMM 'de' yyyy", { locale: es });
  return `Semana del ${startFormatted} al ${endFormatted}`;
}
