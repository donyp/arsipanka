async function checkVersion() {
    const res = await fetch('https://ankaindonesia-arsip.hf.space/api/heartbeat');
    console.log("Status:", res.status);
    console.log("Headers:", [...res.headers.entries()]);
    console.log("Body:", await res.json());
}
checkVersion();
