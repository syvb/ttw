export function msToTimeString(tick) {
    if (tick > 86400000) return "";
    let seconds = tick / 1000;
    let minutes = seconds / 60;
    seconds -= Math.floor(minutes) * 60;
    const hours = minutes / 60;
    minutes -= Math.floor(hours) * 60;
    const dateObj = new Date();
    dateObj.setHours(Math.floor(hours), Math.floor(minutes), Math.floor(seconds));
    return dateObj.toLocaleTimeString();
}

// https://stackoverflow.com/questions/8619879/javascript-calculate-the-day-of-the-year-1-366
export function isLeapYear(date: Date) {
    var year = date.getFullYear();
    if ((year & 3) != 0) return false;
    return ((year % 100) != 0 || (year % 400) == 0);
}

export function getDOY(date: Date) {
    var dayCount = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var mn = date.getMonth();
    var dn = date.getDate();
    var dayOfYear = dayCount[mn] + dn;
    if (mn > 1 && isLeapYear(date)) dayOfYear++;
    return dayOfYear;
}

export function dayNumToDateString(doy: number) {
    const yearNum = Math.floor(doy / 365);
    const dateObj = new Date(yearNum + 1900, 0);
    dateObj.setDate(doy - (yearNum * 365));
    return dateObj.toLocaleDateString();
}

export function daysSince1900ish(dateObj: Date) {
    const yearsSince1990 = dateObj.getFullYear() - 1900;
    const daysIntoYear = getDOY(dateObj);
    // ideally, this would calculate the number of hours since 1990
    // but thanks to leap years, this is sometimes off by a day
    return (yearsSince1990 * 365) + daysIntoYear;
}

export function msIntoDay(dateObj: Date) {
    return dateObj.getMilliseconds() + (dateObj.getSeconds() * 60000) + (dateObj.getHours() * 3600000);
}