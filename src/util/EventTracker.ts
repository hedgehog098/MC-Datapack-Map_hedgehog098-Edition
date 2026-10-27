import * as Counterscale from "@counterscale/tracker";

export namespace EventTracker {
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    const doTrackBeam = Math.random() < 0.2

    export function init() {
        if (isLocal) return
        Counterscale.init({
            siteId: "datapack-map",
            reporterUrl: "https://counterscale.jacobsjo.eu/collect",
            reportOnLocalhost: false
        });
    }

    export function track(event: string ){
        if (isLocal) return
        if ((window as any).beam !== undefined && doTrackBeam) {
            (window as any).beam("/event/" + event)
        }

        Counterscale.trackPageview({
            url: "/event/" + event
        })
    }
}