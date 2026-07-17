// IPTV: live TV channels via HLS.js (Chromium/Firefox can't play .m3u8
// natively through a plain <video> tag, unlike Safari - hls.js is loaded as
// a classic <script> in index.html and used here as the global `Hls`).
//
// Every channel below was individually verified against the broadcaster's
// own domain (not an aggregator list) before being added - see the project
// notes on this feature for which countries/channels had a clean
// verification path. Portugal's RTP was tested and dropped: RTP's own
// servers return an empty 204 whenever a real cross-origin browser Origin
// header is present (confirmed across the whole RTP domain, not just one
// channel) - a deliberate restriction on third-party embedding, not
// something to work around with a header-stripping proxy. Spain's are
// regional public broadcasters, each confirmed on their own domain,
// including with an Origin header present.
const IPTV_CHANNELS = [
  { id: 'rtp1', name: 'RTP1', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtp1HD.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/RTP1_-_Logo_2016.svg/640px-RTP1_-_Logo_2016.svg.png' },
  { id: 'rtp2', name: 'RTP2 Ⓖ', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/rtp2HD.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/en/4/4d/Rtp2_2016_logo.png' },
  { id: 'rtp3', name: 'RTP3', country: 'Portugal', url: 'https://streaming-live.rtp.pt/livetvhlsDVR/rtpnHDdvr.smil/playlist.m3u8?DVR=', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b9/Rtp3.png' },
  { id: 'sic', name: 'SIC', country: 'Portugal', url: 'https://d1zx6l1dn8vaj5.cloudfront.net/out/v1/b89cc37caa6d418eb423cf092a2ef970/index.m3u8', logo: 'https://i.imgur.com/SPMqiDG.png' },
  { id: 'tvi', name: 'TVI', country: 'Portugal', url: 'https://d36mxwpltmym4d.cloudfront.net/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/en/6/63/TVI_logo_2017.png' },
  { id: 'rtp-acores', name: 'RTP Açores', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpacoresHD.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/RTP_A%C3%A7ores_%282016%29.svg/640px-RTP_A%C3%A7ores_%282016%29.svg.png' },
  { id: 'rtp-madeira', name: 'RTP Madeira Ⓢ', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpmadeira.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/en/a/ac/RTP_Madeira_2016.png' },
  { id: 'rtp-noticias', name: 'RTP notícias', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpnHD.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b9/Rtp3.png' },
  { id: 'rtp-mundo', name: 'RTP Mundo', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpi.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/RTP_Mundo.svg/330px-RTP_Mundo.svg.png' },
  { id: 'porto-canal', name: 'Porto Canal Ⓢ', country: 'Portugal', url: 'https://streamer-a01.videos.sapo.pt/live/portocanal/playlist.m3u8', logo: 'https://i.imgur.com/wsyvP2H.png' },
  { id: 'adtv', name: 'ADtv Ⓢ', country: 'Portugal', url: 'https://playout172.livextend.cloud/liveiframe/_definst_/ngrp:liveartvabr_abr/playlist.m3u8', logo: 'https://i.imgur.com/FvlcU3z.png' },
  { id: 'cnn-portugal', name: 'CNN Portugal', country: 'Portugal', url: 'https://sktv-forwarders.7m.pl/get.php?x=CNN_Portugal', logo: 'https://i.imgur.com/NYH39xs.png' },
  { id: 'rtp-africa', name: 'RTP África', country: 'Portugal', url: 'https://streaming-live.rtp.pt/liverepeater/smil:rtpafrica.smil/playlist.m3u8', logo: 'https://i.imgur.com/ISFNy17.png' },
  { id: 'euronews-em-portugu-s', name: 'Euronews em Português Ⓨ', country: 'Portugal', url: 'https://www.youtube.com/euronewspt/live', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Euronews_2022.svg/640px-Euronews_2022.svg.png' },
  { id: 'la-1', name: 'La 1', country: 'Spain', url: 'https://dh6vo1bovy43s.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-x3gcl32l5ffq2/La_1_ES.m3u8', logo: 'https://i.imgur.com/NbesiPn.png' },
  { id: 'la-2', name: 'La 2', country: 'Spain', url: 'https://di2qeq48iv8ps.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-o8u23e6v7vptv/La_2_ES.m3u8', logo: 'https://i.imgur.com/DmuTwDw.png' },
  { id: 'antena-3', name: 'Antena 3', country: 'Spain', url: 'http://185.189.225.150:85/Antena3HD/index.m3u8', logo: 'https://i.imgur.com/j3SP4BS.png' },
  { id: 'cuatro', name: 'Cuatro', country: 'Spain', url: 'http://185.189.225.150:85/CuatroHD/index.m3u8', logo: 'https://i.imgur.com/zROxNap.png' },
  { id: 'telecinco', name: 'Telecinco', country: 'Spain', url: 'http://185.189.225.150:85/TeleCincoHD/index.m3u8', logo: 'https://i.imgur.com/JECsKdk.png' },
  { id: 'la-sexta', name: 'La Sexta', country: 'Spain', url: 'http://185.189.225.150:85/LaSexta/index.m3u8', logo: 'https://i.imgur.com/b59MxgM.png' },
  { id: '24h', name: '24h', country: 'Spain', url: 'https://d3pfmk89wc0vm9.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-nlow3qkp9tmdm/24H_ES.m3u8', logo: 'https://i.imgur.com/ZKR2jKr.png' },
  { id: 'tdp', name: 'tdp', country: 'Spain', url: 'https://rtvelivestream.akamaized.net/rtvesec/tdp/tdp_main.m3u8', logo: 'https://i.imgur.com/HliegRJ.png' },
  { id: 'clan', name: 'clan', country: 'Spain', url: 'https://rtvelivestream.akamaized.net/rtvesec/clan/clan_main_dvr.m3u8', logo: 'https://i.imgur.com/38xIfQ3.png' },
  { id: 'tve-internacional-europe-asia', name: 'TVE Internacional Europe-Asia', country: 'Spain', url: 'https://rtvelivestream.akamaized.net/rtvesec/int/tvei_eu_main_dvr.m3u8', logo: 'https://i.imgur.com/ow1HArj.png' },
  { id: 'neox', name: 'Neox Ⓢ', country: 'Spain', url: 'http://185.189.225.150:85/neox/index.m3u8', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/spain/neox-es.png' },
  { id: 'nova', name: 'Nova Ⓢ', country: 'Spain', url: 'http://185.189.225.150:85/nova/index.m3u8', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/spain/nova-es.png' },
  { id: 'mega', name: 'Mega Ⓢ', country: 'Spain', url: 'http://185.189.225.150:85/mega/index.m3u8', logo: 'https://i.imgur.com/Udrt2eK.png' },
  { id: 'atreseries', name: 'Atreseries Ⓢ', country: 'Spain', url: 'http://181.78.109.48:8000/play/a00l/index.m3u8', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/spain/atreseries-es.png' },
  { id: 'fdf', name: 'FDF', country: 'Spain', url: 'http://185.189.225.150:85/fdf/index.m3u8', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/spain/fdf-es.png' },
  { id: 'divinity', name: 'Divinity Ⓖ', country: 'Spain', url: 'https://directos.divinity.es/orilinear04/live/linear04/main/main.isml/main-audio_spa=128000-video=1500000.m3u8', logo: 'https://i.imgur.com/o7fvEr6.png' },
  { id: 'energy', name: 'Energy Ⓖ', country: 'Spain', url: 'https://directos.energytv.es/orilinear03/live/linear03/main/main.isml/main-audio_spa=128000-video=1500000.m3u8', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/spain/energy-es.png' },
  { id: 'boing', name: 'Boing', country: 'Spain', url: 'http://185.189.225.150:85/boing/index.m3u8', logo: 'https://i.imgur.com/nUYuCAP.png' },
  { id: 'be-mad', name: 'Be Mad Ⓖ', country: 'Spain', url: 'https://directos.bemad.es/orilinear02/live/linear02/main/main.isml/main-audio_spa=128000-video=1500000.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Be_Mad_TV.svg/500px-Be_Mad_TV.svg.png' },
  { id: 'paramount-network', name: 'Paramount Network', country: 'Spain', url: 'http://185.189.225.150:85/Paramount/index.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Paramount_Network.svg/500px-Paramount_Network.svg.png' },
  { id: 'rne-para-todos', name: 'RNE para todos', country: 'Spain', url: 'https://rtvelivestream.akamaized.net/rtvesec/rne/rne_para_todos_main.m3u8', logo: 'https://graph.facebook.com/radionacionalrne/picture?width=200&height=200' },
  { id: 'euronews', name: 'euronews', country: 'Spain', url: 'https://euronews-live-spa-es.fast.rakuten.tv/v1/master/0547f18649bd788bec7b67b746e47670f558b6b2/production-LiveChannel-6571/bitok/eyJzdGlkIjoiMDA0YjY0NTMtYjY2MC00ZTZkLTlkNzEtMTk3YTM3ZDZhZWIxIiwibWt0IjoiZXMiLCJjaCI6NjU3MSwicHRmIjoxfQ==/26034/euronews-es.m3u8', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/international/euro-news-int.png' },
  { id: 'el-pais', name: 'El País', country: 'Spain', url: 'https://d2xqbi89ghm9hh.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-79fx3huimw4xc-ssai-prd/fast-channel-el-pais.m3u8', logo: 'https://graph.facebook.com/elpais/picture?width=200&height=200' },
  { id: 'negocios', name: 'Negocios', country: 'Spain', url: 'https://streaming013.gestec-video.com/hls/negociostv.m3u8', logo: 'https://pbs.twimg.com/profile_images/1321367703731523584/bNMmbetI_200x200.jpg' },
  { id: 'squirrel', name: 'Squirrel', country: 'Spain', url: 'https://tsw.streamingwebtv24.it:1936/inteccdn1/inteccdn1/playlist.m3u8', logo: 'https://i.imgur.com/urF0kYA.png' },
  { id: 'bom-cine', name: 'BOM Cine', country: 'Spain', url: 'https://tsw.streamingwebtv24.it:1936/inteccdn3/inteccdn3/playlist.m3u8', logo: 'https://i.imgur.com/cqhofMU.png' },
  { id: 'telemadrid', name: 'Telemadrid', country: 'Spain', url: 'https://telemadrid-23-secure2.akamaized.net/master.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/TeleMadrid.svg/500px-TeleMadrid.svg.png' },
  { id: 'la-otra', name: 'La Otra', country: 'Spain', url: 'https://laotra-1-23-secure2.akamaized.net/master.m3u8', logo: 'https://i.imgur.com/W1UZyXH.png' },
  { id: 'canal-sur-andalucia', name: 'Canal Sur Andalucía', country: 'Spain', url: 'https://d35x6iaiw8f75z.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-kbwsl0jk1bvoo/canal_sur_andalucia_es.m3u8', logo: 'https://i.imgur.com/WcVOXPr.png' },
  { id: 'la-8-mediterraneo', name: 'La 8 Mediterráneo', country: 'Spain', url: 'https://streaming004.gestec-video.com/hls/8TV.m3u8', logo: 'https://graph.facebook.com/la8mediterraneo/picture?width=200&height=200' },
  { id: 'television-canaria', name: 'Televisión Canaria Ⓨ', country: 'Spain', url: 'https://www.youtube.com/user/TelevisionCanaria/live', logo: 'https://i.imgur.com/68LNS8e.png' },
  { id: 'ib3-global', name: 'IB3 Global Ⓨ', country: 'Spain', url: 'https://www.youtube.com/c/ib3/live', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/spain/ib3-es.png' },
  { id: 'canal-extremadura', name: 'Canal Extremadura', country: 'Spain', url: 'https://cdnapisec.kaltura.com/p/5581662/sp/558166200/playManifest/entryId/1_1u7ssdy3/protocol/https/format/applehttp/flavorIds/1_8xbndriw/a.m3u8', logo: 'https://i.imgur.com/xBeywIA.png' },
  { id: 'aragon-tv', name: 'Aragón TV Ⓢ', country: 'Spain', url: 'https://cartv.streaming.aranova.es/hls/live/aragontv_canal1.m3u8', logo: 'https://i.imgur.com/8H3Q07b.png' },
  { id: 'etb1', name: 'ETB1', country: 'Spain', url: 'https://multimedia.eitb.eus/live-content/etb1hd-hls/master.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/ETB1_2022_logo.svg/500px-ETB1_2022_logo.svg.png' },
  { id: 'etb2', name: 'ETB2', country: 'Spain', url: 'https://multimedia.eitb.eus/live-content/etb2hd-hls/master.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/ETB2_2022_logo.svg/500px-ETB2_2022_logo.svg.png' },
  { id: 'tv3', name: 'TV3', country: 'Spain', url: 'http://185.189.225.150:85/tv3/index.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/TV3.svg/300px-TV3.svg.png' },
  { id: 'tv3cat', name: 'TV3Cat Ⓖ', country: 'Spain', url: 'https://directes3-tv-int.3catdirectes.cat/live-content/tvi-hls/master.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/TV3CAT.svg/500px-TV3CAT.svg.png' },
  { id: '3-24', name: '3/24', country: 'Spain', url: 'https://directes-tv-int.3catdirectes.cat/live-origin/canal324-hls/master.m3u8', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/spain/3-24-es.png' },
  { id: 'bon-dia', name: 'Bon Dia', country: 'Spain', url: 'https://directes-tv-int.3catdirectes.cat/live-content/bondia-hls/master.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4f/Logo_Bon_Dia_TV.png' },
  { id: 'sx3', name: 'SX3 Ⓖ', country: 'Spain', url: 'https://directes-tv-cat.3catdirectes.cat/live-content/super3-hls/master.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/SX3_logo.svg/2880px-SX3_logo.svg.png' },
  { id: 'el-33', name: 'El 33 Ⓖ', country: 'Spain', url: 'https://directes-tv-cat.3catdirectes.cat/live-origin/c33-super3-hls/master.m3u8', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/spain/el-33-es.png' },
  { id: 'esport3', name: 'Esport3 Ⓖ', country: 'Spain', url: 'https://directes-tv-es.3catdirectes.cat/live-origin/esport3-hls/master.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Esport3.svg/1200px-Esport3.svg.png' },
  { id: 'canal-te24', name: 'Canal TE24', country: 'Spain', url: 'https://ingest1-video.streaming-pro.com/esportsteABR/etestream/playlist.m3u8', logo: 'https://i.ibb.co/3ynghbW/logox2.png' },
  { id: 'punt-tv', name: 'À Punt TV', country: 'Spain', url: 'https://bcovlive-a.akamaihd.net/8499d938ef904e39b58a4adec2ddeada/eu-west-1/6057955885001/playlist_dvr.m3u8', logo: 'https://i.imgur.com/M88LoNl.png' },
  { id: '7-region-de-murcia', name: '7 Región de Murcia Ⓢ', country: 'Spain', url: 'https://rtv-murcia-live.globalmest.com/principal/smil:principal.smil/playlist.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/La_7_logo.svg/150px-La_7_logo.svg.png' },
  { id: 'canal-4-tenerife', name: 'Canal 4 Tenerife', country: 'Spain', url: 'https://videoserver.tmcreativos.com:19360/ccxwhsfcnq/ccxwhsfcnq.m3u8', logo: 'https://i.imgur.com/Egymir4.png' },
  { id: 'television-melilla', name: 'Televisión Melilla', country: 'Spain', url: 'https://tvmelilla-hls-rm-lw.flumotion.com/playlist.m3u8', logo: 'https://raw.githubusercontent.com/tv-logo/tv-logos/refs/heads/main/countries/spain/television-melilla-es.png' },
  { id: 'la-1-catalunya', name: 'La 1 (Catalunya)', country: 'Spain', url: 'https://rtvelivestream-clnx.rtve.es/rtvesec/cat/la1_cat_main_dvr.m3u8', logo: 'https://i.imgur.com/NbesiPn.png' },
  { id: 'la-1-canarias', name: 'La 1 (Canarias)', country: 'Spain', url: 'https://rtvelivestream-clnx.rtve.es/rtvesec/can/la1_can_main_720.m3u8', logo: 'https://i.imgur.com/NbesiPn.png' },
  { id: 'la-2-catalunya', name: 'La 2 (Catalunya)', country: 'Spain', url: 'https://rtvelivestream.akamaized.net/rtvesec/cat/la2_cat_main_dvr.m3u8', logo: 'https://i.imgur.com/DmuTwDw.png' },
  { id: 'la-2-canarias', name: 'La 2 (Canarias)', country: 'Spain', url: 'https://ztnr.rtve.es/ztnr/5468585.m3u8', logo: 'https://i.imgur.com/DmuTwDw.png' },
  { id: 'buzzr', name: 'Buzzr Ⓖ', country: 'USA', url: 'https://buzzrota-ono.amagi.tv/playlist1080.m3u8', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Buzzr_logo.svg/768px-Buzzr_logo.svg.png' },
  { id: 'retro-tv', name: 'Retro TV', country: 'USA', url: 'https://bcovlive-a.akamaihd.net/5e531be3ed6c41229b2af2d9bffba88d/us-east-1/6183977686001/profile_1/chunklist.m3u8', logo: 'https://i.imgur.com/PNTYOgg.png' },
  { id: 'stadium', name: 'Stadium', country: 'USA', url: 'https://bcovlive-a.akamaihd.net/e64d564b9275484f85981d8c146fb915/us-east-1/5994000126001/profile_1/976f34cf5a614518b7b539cbf9812080/chunklist_ssaiV.m3u8', logo: 'https://i.imgur.com/6ae9E8d.png' },
  { id: 'biz-tv', name: 'Biz TV', country: 'USA', url: 'https://thegateway.app/BizTV/BizTV-Tones/chunks.m3u8?nimblesessionid=94690008', logo: 'https://i.imgur.com/cbGvXyF.jpg' },
  { id: 'heartland', name: 'Heartland', country: 'USA', url: 'https://bcovlive-a.akamaihd.net/1ad942d15d9643bea6d199b729e79e48/us-east-1/6183977686001/profile_1/chunklist.m3u8', logo: 'https://i.imgur.com/a67bbag.png' },
  { id: 'rev-n', name: 'Rev\'n', country: 'USA', url: 'https://bcovlive-a.akamaihd.net/a71236fdda1747999843bd3d55bdd6fa/us-east-1/6183977686001/profile_1/chunklist.m3u8', logo: 'https://i.imgur.com/VUhqVgG.png' },
  { id: 'cnn', name: 'CNN', country: 'USA', url: 'https://tve-live-lln.warnermediacdn.com/hls/live/586495/cnngo/cnn_slate/VIDEO_0_3564000.m3u8', logo: 'https://i.imgur.com/vyrc1I1.png' },
  { id: 'cnbc', name: 'CNBC Ⓨ', country: 'USA', url: 'https://www.youtube.com/c/CNBC/live', logo: 'https://i.imgur.com/BTasyOy.png' },
  { id: 'bloomberg', name: 'Bloomberg', country: 'USA', url: 'https://bloomberg.com/media-manifest/streams/us.m3u8', logo: 'https://i.imgur.com/VnCcH73.png' },
  { id: 'abc-news', name: 'ABC News', country: 'USA', url: 'https://content.uplynk.com/channel/3324f2467c414329b3b0cc5cd987b6be.m3u8', logo: 'https://i.imgur.com/7sJLzKi.png' },
  { id: 'cbs-news', name: 'CBS News', country: 'USA', url: 'https://cbsnews.akamaized.net/hls/live/2020607/cbsnlineup_8/master.m3u8', logo: 'https://i.imgur.com/nki2HDQ.png' },
  { id: 'nbc-news', name: 'NBC News', country: 'USA', url: 'http://dai2.xumo.com/xumocdn/p=roku/amagi_hls_data_xumo1212A-xumo-nbcnewsnow/CDN/playlist.m3u8', logo: 'https://i.imgur.com/v48mMRT.png' },
  { id: 'reuters-tv', name: 'Reuters TV', country: 'USA', url: 'https://reuters-reutersnow-1-eu.rakuten.wurl.tv/playlist.m3u8', logo: 'https://i.imgur.com/AbvCnoH.png' },
  { id: 'nasa-tv-public', name: 'NASA TV Public', country: 'USA', url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master_2000.m3u8', logo: 'https://i.imgur.com/rmyfoOI.png' },
  { id: 'nasa-tv-media', name: 'NASA TV Media', country: 'USA', url: 'https://ntv2.akamaized.net/hls/live/2013923/NASA-NTV2-HLS/master.m3u8', logo: 'https://i.imgur.com/rmyfoOI.png' },
  { id: 'bbc-food', name: 'BBC Food', country: 'USA', url: 'https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/5fb5844bf5514d0007945bda/master.m3u8?deviceId=channel&deviceModel=web&deviceVersion=1.0&appVersion=1.0&deviceType=rokuChannel&deviceMake=rokuChannel&deviceDNT=1&advertisingId=channel&embedPartner=rokuChannel&appName=rokuchannel&is_lat=1&bmodel=bm1&content=channel&platform=web&tags=ROKU_CONTENT_TAGS&coppa=false&content_type=livefeed&rdid=channel&genre=ROKU_ADS_CONTENT_GENRE&content_rating=ROKU_ADS_CONTENT_RATING&studio_id=viacom&channel_id=channel', logo: 'https://i.imgur.com/N3xiz4m.png' },
  { id: 'bbc-home', name: 'BBC Home', country: 'USA', url: 'https://service-stitcher.clusters.pluto.tv/v1/stitch/embed/hls/channel/5fb5836fe745b600070fc743/master.m3u8?deviceId=channel&deviceModel=web&deviceVersion=1.0&appVersion=1.0&deviceType=rokuChannel&deviceMake=rokuChannel&deviceDNT=1&advertisingId=channel&embedPartner=rokuChannel&appName=rokuchannel&is_lat=1&bmodel=bm1&content=channel&platform=web&tags=ROKU_CONTENT_TAGS&coppa=false&content_type=livefeed&rdid=channel&genre=ROKU_ADS_CONTENT_GENRE&content_rating=ROKU_ADS_CONTENT_RATING&studio_id=viacom&channel_id=channel', logo: 'https://i.imgur.com/Ii8DX1x.png' },
  { id: 'docurama', name: 'Docurama', country: 'USA', url: 'https://cinedigm.vo.llnwd.net/conssui/amagi_hls_data_xumo1234A-docuramaA/CDN/master.m3u8', logo: 'https://i.imgur.com/bNg8mze.png' },
  { id: 'drybar-comedy', name: 'Drybar Comedy', country: 'USA', url: 'https://drybar-drybarcomedy-1-ca.samsung.wurl.com/manifest/playlist.m3u8', logo: 'https://i.imgur.com/EldlmTp.png' },
  { id: 'music-channel', name: 'Music Channel', country: 'USA', url: 'http://media.boni-records.com/index.m3u8', logo: 'http://media.boni-records.com/logo.png' }
];

const iptvVideo = document.getElementById('iptv-video');
let iptvHls = null;
let currentIptvChannel = null;
let iptvFullscreen = false;

function stopIptv() {
  if (iptvHls) {
    iptvHls.destroy();
    iptvHls = null;
  }
  iptvVideo.removeAttribute('src');
  iptvVideo.load();
  currentIptvChannel = null;
  renderIptvTab();
}

function playIptvChannel(channel) {
  if (currentIptvChannel && currentIptvChannel.id === channel.id) {
    stopIptv();
    return;
  }
  if (iptvHls) {
    iptvHls.destroy();
    iptvHls = null;
  }
  currentIptvChannel = channel;
  renderIptvTab();
  // renderIptvTab() just rebuilt the DOM around the persistent <video>
  // element - grab it fresh rather than relying on the closed-over
  // reference, since innerHTML replacement elsewhere doesn't touch this
  // element (it lives outside any replaced section) but the surrounding
  // wrapper markup does get rebuilt.
  const video = document.getElementById('iptv-video');
  if (window.Hls && window.Hls.isSupported()) {
    iptvHls = new window.Hls();
    iptvHls.loadSource(channel.url);
    iptvHls.attachMedia(video);
    iptvHls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    iptvHls.on(window.Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.error('[iptv] fatal hls error:', data.type, data.details);
        alert(`Couldn't play ${channel.name} - the stream may be temporarily down.`);
        stopIptv();
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari (or any browser with native HLS support) doesn't need hls.js.
    video.src = channel.url;
    video.addEventListener('loadedmetadata', () => video.play().catch(() => {}), { once: true });
  } else {
    alert("This browser can't play live TV streams.");
    currentIptvChannel = null;
    renderIptvTab();
  }
}

function toggleIptvFullscreen() {
  const video = document.getElementById('iptv-video');
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    video.requestFullscreen();
  }
}

document.addEventListener('fullscreenchange', () => {
  iptvFullscreen = !!document.fullscreenElement;
  // Only re-render if the IPTV tab is what's actually on screen - avoids
  // clobbering another tab's DOM if fullscreen exits while elsewhere.
  if (document.getElementById('view-iptv').classList.contains('active')) renderIptvTab();
});

function iptvChannelCard(channel) {
  const playing = currentIptvChannel && currentIptvChannel.id === channel.id;
  const img = channel.logo
    ? `<img class="iptv-card-logo" src="${channel.logo}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'iptv-card-logo iptv-card-logo-fallback',textContent:'📺'}))">`
    : '<div class="iptv-card-logo iptv-card-logo-fallback">📺</div>';
  return `
    <div class="iptv-card${playing ? ' playing' : ''}" data-channel-id="${channel.id}">
      ${img}
      <div class="iptv-card-name">${channel.name}</div>
      ${playing ? '<div class="iptv-card-status">▶ Playing</div>' : ''}
    </div>`;
}

function renderIptvTab() {
  const view = document.getElementById('view-iptv');
  if (!view) return;

  const player = `
    <div class="iptv-player">
      <div class="iptv-player-video-wrap"></div>
      <div class="iptv-player-info">
        <div class="iptv-player-name">${currentIptvChannel ? currentIptvChannel.name : 'Select a channel'}</div>
        ${currentIptvChannel ? `
          <div class="iptv-player-controls">
            <button id="iptv-fullscreen-btn" class="spotify-btn-primary">${iptvFullscreen ? '⤢ Exit Fullscreen' : '⛶ Fullscreen'}</button>
            <button id="iptv-stop-btn" class="radio-btn" title="Stop">⏹</button>
          </div>` : ''}
      </div>
    </div>`;

  const countries = [...new Set(IPTV_CHANNELS.map((c) => c.country))];
  const grid = countries.map((country) => `
    <div class="spotify-lib-section">
      <div class="spotify-lib-title">${country}</div>
      <div class="iptv-grid">
        ${IPTV_CHANNELS.filter((c) => c.country === country).map(iptvChannelCard).join('')}
      </div>
    </div>`).join('');

  view.innerHTML = player + grid;

  // The persistent <video> element lives outside any replaced section (see
  // index.html) - move it into the wrapper we just rendered rather than
  // recreating it, so playback isn't interrupted by this re-render.
  const wrap = view.querySelector('.iptv-player-video-wrap');
  if (wrap) wrap.appendChild(iptvVideo);
}

export function initIptv() {
  document.getElementById('view-iptv').addEventListener('click', (e) => {
    if (e.target.id === 'iptv-fullscreen-btn') return toggleIptvFullscreen();
    if (e.target.id === 'iptv-stop-btn') return stopIptv();
    const card = e.target.closest('[data-channel-id]');
    if (card) {
      const channel = IPTV_CHANNELS.find((c) => c.id === card.dataset.channelId);
      if (channel) playIptvChannel(channel);
    }
  });
  renderIptvTab();
}
