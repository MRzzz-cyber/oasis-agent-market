import QRCode from 'qrcode/lib/browser.js';
export async function drawReceiveQr(canvas,address){await QRCode.toCanvas(canvas,address,{errorCorrectionLevel:'M',margin:4,width:224,color:{dark:'#101312',light:'#ffffff'}});}
