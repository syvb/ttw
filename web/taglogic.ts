class TagAlg {
    static nextPingAfter(time: number) {
        throw new Error("abstract");
    }
    static lastPingBefore(time: number) {
        throw new Error("abstract");
    }
    static pingsBetween(time1: number, time2: number) {
        throw new Error("abstract");
    }
}

class PerlAlg extends TagAlg {
    static shouldPingAt(time: number) {

    }
}
