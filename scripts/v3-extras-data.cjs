"use strict";

// Hand-edited extension seeds for the 500-item content release.  The build
// script turns these compact records into the public schema; keeping the
// factual differentiators here makes the output deterministic and reviewable.

function rows(block, fields, label) {
  const parsed = block.trim().split(/\r?\n/).filter(Boolean).map((line, index) => {
    const values = line.split("~").map((value) => value.trim());
    if (values.length !== fields.length) {
      throw new Error(`${label} row ${index + 1}: expected ${fields.length} fields, got ${values.length}`);
    }
    return Object.fromEntries(fields.map((field, position) => [field, values[position]]));
  });
  return Object.freeze(parsed);
}

const CITY_FIELDS = Object.freeze([
  "slug", "cityZh", "cityEn", "countryZh", "countryEn", "countryCode", "region",
  "latitude", "longitude", "timezone", "identity", "highlights", "bestFor",
  "motif", "themeTags", "sourcePage"
]);

const CITY_EXTENSION_ROWS = rows(String.raw`
amsterdam~阿姆斯特丹~Amsterdam~荷兰~Netherlands~NL~欧洲~52.3676~4.9041~Europe/Amsterdam~运河环带、窄立面商屋与自行车日常把水城遗产融入现代生活~运河环带；国立博物馆群；约旦区街巷~城市设计、水岸生活与荷兰艺术~运河屋与自行车~水利；艺术；日常设计~Amsterdam
brussels~布鲁塞尔~Brussels~比利时~Belgium~BE~欧洲~50.8503~4.3517~Europe/Brussels~哥特广场、新艺术建筑、漫画文化与欧洲机构在多语言街区中并置~大广场；新艺术路线；欧洲区~建筑、漫画与多语言公共生活~山墙与鸢尾~建筑；语言；欧洲政治~Brussels
copenhagen~哥本哈根~Copenhagen~丹麦~Denmark~DK~欧洲~55.6761~12.5683~Europe/Copenhagen~港湾浴场、自行车网络与北欧设计展示了公共空间如何服务日常幸福~新港；设计博物馆；港湾公共空间~设计、骑行与滨水城市治理~彩色港屋与单车~设计；公共空间；海港~Copenhagen
stockholm~斯德哥尔摩~Stockholm~瑞典~Sweden~SE~欧洲~59.3293~18.0686~Europe/Stockholm~十四座岛屿把王城、现代博物馆和群岛生态连成层次清晰的水上首都~老城；瓦萨博物馆；斯德哥尔摩群岛~北欧历史、博物馆与岛屿风景~王冠与群岛~海洋；博物馆；北欧历史~Stockholm
oslo~奥斯陆~Oslo~挪威~Norway~NO~欧洲~59.9139~10.7522~Europe/Oslo~峡湾、森林边界、新滨水建筑和航海遗产共同定义这座可迅速抵达自然的首都~奥斯陆峡湾；歌剧院滨水区；比格迪博物馆群~航海史、当代建筑与近郊自然~峡湾与斜坡屋顶~自然；航海；建筑~Oslo
helsinki~赫尔辛基~Helsinki~芬兰~Finland~FI~欧洲~60.1699~24.9384~Europe/Helsinki~花岗岩海岸、现代主义设计、公共桑拿和海上堡垒构成克制而开放的波罗的海气质~芬兰堡；设计街区；公共桑拿文化~设计、海防历史与生活方式~岩岸与白色穹顶~设计；海港；公共生活~Helsinki
riga~里加~Riga~拉脱维亚~Latvia~LV~欧洲~56.9496~24.1052~Europe/Riga~汉萨旧城、新艺术立面和中央市场把波罗的海贸易史与当代市井连接起来~黑头宫；新艺术街区；中央市场~建筑细节、贸易史与市场观察~尖塔与新艺术曲线~历史层积；建筑；市场~Riga
vilnius~维尔纽斯~Vilnius~立陶宛~Lithuania~LT~欧洲~54.6872~25.2797~Europe/Vilnius~巴洛克旧城、犹太记忆、大学庭院与独立后的创意街区呈现多重历史身份~老城教堂群；维尔纽斯大学；乌祖皮斯~宗教建筑、城市记忆与创意社区~钟塔与庭院~记忆；建筑；创意社区~Vilnius
warsaw~华沙~Warsaw~波兰~Poland~PL~欧洲~52.2297~21.0122~Europe/Warsaw~战后重建的旧城、起义记忆与当代文化机构让城市韧性成为可阅读的空间经验~重建旧城；华沙起义博物馆；维斯瓦河岸~重建史、二十世纪记忆与公共文化~重建山墙与河线~重建；记忆；韧性~Warsaw
krakow~克拉科夫~Kraków~波兰~Poland~PL~欧洲~50.0647~19.945~Europe/Warsaw~中世纪广场、大学传统、卡齐米日社区与近现代记忆共同塑造波兰文化重镇~中央集市广场；瓦维尔城堡；卡齐米日~中欧历史、宗教文化与步行街区~城堡与号角~历史；宗教；城市记忆~Krakow
budapest~布达佩斯~Budapest~匈牙利~Hungary~HU~欧洲~47.4979~19.0402~Europe/Budapest~多瑙河把丘陵城堡、议会建筑、温泉和十九世纪都市遗产连成壮阔轴线~布达城堡；多瑙河岸；历史温泉~帝国城市史、建筑与温泉文化~桥梁与温泉拱券~河流；建筑；生活方式~Budapest
bratislava~布拉迪斯拉发~Bratislava~斯洛伐克~Slovakia~SK~欧洲~48.1486~17.1077~Europe/Bratislava~城堡高地、多瑙河与紧凑旧城展示了中欧边境首都在多国历史中的转换~布拉迪斯拉发城堡；旧城广场；多瑙河步道~边境史、小城尺度与河岸漫步~白堡与蓝河~边境；河流；中欧历史~Bratislava
zagreb~萨格勒布~Zagreb~克罗地亚~Croatia~HR~欧洲~45.815~15.9819~Europe/Zagreb~上城石巷、下城公园轴线、市场和咖啡馆构成内陆克罗地亚的文化节奏~上城；绿色马蹄公园群；多拉茨市场~城市规划、市场生活与克罗地亚文化~彩瓦屋顶与公园轴~城市规划；市场；公共生活~Zagreb
dubrovnik~杜布罗夫尼克~Dubrovnik~克罗地亚~Croatia~HR~欧洲~42.6507~18.0944~Europe/Zagreb~完整城墙、石灰岩街道和亚得里亚海航运史让古共和国遗产格外集中~旧城城墙；斯特拉敦大道；海上共和国史~城防建筑、海洋贸易与清晨步行~城墙与橙瓦~海洋；城防；贸易~Dubrovnik
split~斯普利特~Split~克罗地亚~Croatia~HR~欧洲~43.5081~16.4402~Europe/Zagreb~戴克里先宫殿并非封闭遗址，而是商店、住宅和广场持续生长的城市核心~戴克里先宫；里瓦海滨；马尔扬山~罗马遗产、活态旧城与海岸生活~宫墙与棕榈~古代；活态遗产；海洋~Split
belgrade~贝尔格莱德~Belgrade~塞尔维亚~Serbia~RS~欧洲~44.7866~20.4489~Europe/Belgrade~萨瓦河与多瑙河交汇处的要塞、南斯拉夫现代主义和夜间文化呈现粗粝活力~卡莱梅格丹要塞；现代主义建筑；泽蒙河岸~巴尔干历史、建筑与河岸社区~双河与要塞~边境；现代主义；河流~Belgrade
sofia~索菲亚~Sofia~保加利亚~Bulgaria~BG~欧洲~42.6977~23.3219~Europe/Sofia~罗马遗迹、东正教建筑、奥斯曼痕迹和社会主义城市空间叠在维托沙山脚~亚历山大·涅夫斯基教堂；地下罗马遗址；维托沙山~宗教史、考古与城市近郊徒步~金顶与雪山~历史层积；宗教；自然~Sofia
bucharest~布加勒斯特~Bucharest~罗马尼亚~Romania~RO~欧洲~44.4268~26.1025~Europe/Bucharest~法式大道、社会主义巨构、老住宅与新文化空间并置出强烈尺度反差~罗马尼亚雅典娜神庙；议会宫；旧城与住宅区~城市转型、建筑反差与东欧历史~林荫道与巨构~城市转型；建筑；近现代史~Bucharest
porto~波尔图~Porto~葡萄牙~Portugal~PT~欧洲~41.1579~-8.6291~Europe/Lisbon~陡坡街巷、杜罗河桥、彩釉砖和酒窖共同讲述大西洋贸易城市的日常肌理~里贝拉河岸；路易一世大桥；瓷砖建筑~河港史、街巷摄影与地方饮食~铁桥与蓝白瓷砖~河流；贸易；建筑~Porto
seville~塞维利亚~Seville~西班牙~Spain~ES~欧洲~37.3891~-5.9845~Europe/Madrid~伊斯兰建筑遗产、橙树庭院、航海贸易和弗拉门戈共同塑造安达卢西亚热烈气质~塞维利亚王宫；主教座堂；特里亚纳~建筑、航海史与表演文化~橙树与马蹄拱~多元历史；音乐；航海~Seville
granada~格拉纳达~Granada~西班牙~Spain~ES~欧洲~37.1773~-3.5986~Europe/Madrid~阿尔罕布拉宫、阿尔拜辛山坡和内华达山背景保存了安达卢斯文明的细密层次~阿尔罕布拉宫；阿尔拜辛；萨克罗蒙特~伊斯兰艺术、山城步行与文化交汇~水渠与石榴纹~建筑；多元文化；山城~Granada
bilbao~毕尔巴鄂~Bilbao~西班牙~Spain~ES~欧洲~43.263~-2.935~Europe/Madrid~工业河港通过当代建筑、公共交通和巴斯克文化实现了可见的城市转型~古根海姆博物馆；内维翁河岸；老城市场~工业更新、当代艺术与巴斯克饮食~钛金属曲面与河湾~工业转型；艺术；地方文化~Bilbao
lyon~里昂~Lyon~法国~France~FR~欧洲~45.764~4.8357~Europe/Paris~罗讷河与索恩河之间的文艺复兴街区、隐秘通道和丝织传统构成精致城市层次~里昂老城；串廊；汇流区~城市历史、饮食与建筑细节~双河与丝线~河流；手工业；饮食~Lyon
marseille~马赛~Marseille~法国~France~FR~欧洲~43.2965~5.3698~Europe/Paris~地中海港口、移民社区、古老市场和卡朗格海岸让法国最古老大城保持开放张力~旧港；欧洲与地中海文明博物馆；卡朗格峡湾~港口史、多元文化与海岸徒步~海港与石灰岩湾~迁徙；海洋；多元文化~Marseille
munich~慕尼黑~Munich~德国~Germany~DE~欧洲~48.1351~11.582~Europe/Berlin~王室收藏、啤酒馆传统、现代设计和通往阿尔卑斯的地理位置共同塑造巴伐利亚首府~艺术博物馆群；老城广场；英国花园~艺术史、城市公园与巴伐利亚文化~洋葱顶与栗树~艺术；公园；地方传统~Munich
hamburg~汉堡~Hamburg~德国~Germany~DE~欧洲~53.5511~9.9937~Europe/Berlin~易北河港、仓库城、砖砌表现主义和音乐空间展现北德商贸城市的国际性~仓库城；易北爱乐厅；港口渡轮~港口工业史、建筑与音乐~砖仓与港吊~海港；音乐；贸易~Hamburg
osaka~大阪~Osaka~日本~Japan~JP~亚洲~34.6937~135.5023~Asia/Tokyo~商人城市传统、运河、街头饮食和大胆幽默构成不同于东京的亲近节奏~大阪城；道顿堀；中之岛~城市商业史、饮食与夜间街区~霓虹运河与城楼~饮食；商业；城市文化~Osaka
nara~奈良~Nara~日本~Japan~JP~亚洲~34.6851~135.8048~Asia/Tokyo~古寺、神社、森林与早期都城格局保存了日本国家形成期的宗教空间~东大寺；春日大社；奈良公园~古代史、佛教艺术与林间步行~寺檐与鹿~古代；宗教；自然~Nara
kanazawa~金泽~Kanazawa~日本~Japan~JP~亚洲~36.5613~136.6562~Asia/Tokyo~城下町格局、庭园、金箔和茶屋街延续了北陆地区精细的手工艺传统~兼六园；长町武家屋敷；东茶屋街~庭园、工艺与历史街区~雪吊与金箔~手工艺；庭园；历史~Kanazawa
sapporo~札幌~Sapporo~日本~Japan~JP~亚洲~43.0618~141.3545~Asia/Tokyo~棋盘城市、雪国生活、啤酒工业和北海道农业文化呈现日本北方现代开发史~大通公园；札幌啤酒博物馆；北海道大学~雪国城市、工业史与地方饮食~雪晶与钟楼~气候；工业；饮食~Sapporo
fukuoka~福冈~Fukuoka~日本~Japan~JP~亚洲~33.5902~130.4017~Asia/Tokyo~面向亚洲大陆的港口位置、屋台饮食和紧凑海湾让福冈兼具交流史与轻松日常~博多旧城；屋台；海滨百道~港口交流、饮食与步行尺度~屋台灯笼与海湾~贸易；饮食；海港~Fukuoka
taipei~台北~Taipei~中国~China~TW~亚洲~25.033~121.5654~Asia/Taipei~盆地地形、庙宇、市集、现代文化机构和便利山径使密集城市与自然迅速切换~大稻埕；故宫博物院；阳明山~城市记忆、饮食与近郊自然~山线与骑楼~城市记忆；饮食；自然~Taipei
tainan~台南~Tainan~中国~China~TW~亚洲~22.9999~120.2269~Asia/Taipei~古城门、庙宇密度、街屋与小吃保存了台湾南部多层次的海洋交流史~赤崁楼；孔庙；传统市场~地方史、宗教空间与饮食~庙檐与巷弄~历史层积；宗教；饮食~Tainan
hong-kong~香港~Hong Kong~中国~China~HK~亚洲~22.3193~114.1694~Asia/Hong_Kong~高密度街区、维多利亚港、山径和多语言商业文化在极短距离内强烈转换~维多利亚港；中环建筑；郊野山径~港口史、城市密度与山海步行~天际线与山径~海港；城市密度；迁徙~Hong_Kong
macau~澳门~Macao~中国~China~MO~亚洲~22.1987~113.5439~Asia/Macau~中葡建筑、宗教街区、海港贸易和社区饮食浓缩在步行可达的半岛空间~历史城区；妈阁庙；路环村落~海洋交流史、建筑与地方饮食~葡式碎石路与莲花~多元文化；贸易；建筑~Macau
chengdu~成都~Chengdu~中国~China~CN~亚洲~30.5728~104.0668~Asia/Shanghai~平原水系、茶馆日常、川菜和古蜀遗产共同形成松弛又深厚的城市气质~金沙遗址；人民公园茶馆；成都博物馆~古蜀文明、饮食与公共生活~水纹与盖碗茶~古代；饮食；公共生活~Chengdu
chongqing~重庆~Chongqing~中国~China~CN~亚洲~29.563~106.5516~Asia/Shanghai~两江交汇、立体山城交通、工业遗产和码头文化塑造极具辨识度的垂直景观~两江夜景；山城步道；工业博物馆~城市地形、交通与码头史~层叠轨道与双江~山城；工业；河流~Chongqing
nanjing~南京~Nanjing~中国~China~CN~亚洲~32.0603~118.7969~Asia/Shanghai~城墙、陵寝、民国建筑和战争记忆让多朝古都具有沉静的时间纵深~明城墙；中山陵；南京博物院~都城史、近现代记忆与博物馆~城砖与梧桐~历史；记忆；建筑~Nanjing
suzhou~苏州~Suzhou~中国~China~CN~亚洲~31.2989~120.5853~Asia/Shanghai~园林、运河、丝绸与昆曲把江南审美转化为可步入的空间和声音~古典园林；平江路；苏州博物馆~园林艺术、水城与传统表演~漏窗与水巷~园林；水利；艺术~Suzhou
hangzhou~杭州~Hangzhou~中国~China~CN~亚洲~30.2741~120.1551~Asia/Shanghai~西湖景观、茶园、运河和数字产业在同一城市中形成古典与当代的反差~西湖；龙井茶园；中国丝绸博物馆~山水传统、茶文化与城市转型~湖堤与茶叶~自然；手工艺；现代化~Hangzhou
guangzhou~广州~Guangzhou~中国~China~CN~亚洲~23.1291~113.2644~Asia/Shanghai~珠江港口、岭南建筑、早茶和长期对外贸易塑造务实开放的南方都会~陈家祠；沙面；珠江沿岸~海上贸易、岭南文化与饮食~骑楼与木棉~贸易；饮食；建筑~Guangzhou
kashgar~喀什~Kashgar~中国~China~CN~亚洲~39.4704~75.9898~Asia/Shanghai~绿洲市集、土坯街巷、清真寺和多民族手工艺体现丝路节点的生活连续性~喀什古城；艾提尕尔清真寺；手工艺市集~丝路史、绿洲城市与手工艺~土墙与石榴~丝路；多元文化；手工艺~Kashgar
kathmandu~加德满都~Kathmandu~尼泊尔~Nepal~NP~亚洲~27.7172~85.324~Asia/Kathmandu~谷地王城、佛塔、印度教圣地与地震修复现场密集呈现喜马拉雅文明交流~杜巴广场；斯瓦扬布纳特；博达哈大佛塔~宗教艺术、城市修复与山地文明~佛眼与雪峰~宗教；修复；山地~Kathmandu
varanasi~瓦拉纳西~Varanasi~印度~India~IN~亚洲~25.3176~82.9739~Asia/Kolkata~恒河阶梯、古老巷道、仪式和音乐传统使生死观念直接进入城市日常~恒河河坛；老城巷道；古典音乐传统~宗教文化、河流城市与生命观~河阶与油灯~宗教；河流；生命礼仪~Varanasi
mumbai~孟买~Mumbai~印度~India~IN~亚洲~19.076~72.8777~Asia/Kolkata~海港、殖民建筑、电影产业、纺织工业遗产和移民社区共同驱动这座高密度都会~印度门；维多利亚终点站；电影与市场街区~城市史、电影文化与社会观察~拱门与本地列车~电影；迁徙；工业~Mumbai
kolkata~加尔各答~Kolkata~印度~India~IN~亚洲~22.5726~88.3639~Asia/Kolkata~殖民时期公共建筑、孟加拉文艺传统、书市和河港共同保存知识城市气质~维多利亚纪念堂；学院街；胡格利河岸~文学、近代史与街区文化~书页与黄出租车~文学；历史；河港~Kolkata
delhi~德里~Delhi~印度~India~IN~亚洲~28.6139~77.209~Asia/Kolkata~苏丹王朝、莫卧儿帝国、殖民规划和当代都会在多个城市层次中叠加~胡马雍陵；旧德里；新德里轴线~帝国史、建筑与市井生活~红砂岩与林荫轴线~历史层积；建筑；市场~Delhi
udaipur~乌代布尔~Udaipur~印度~India~IN~亚洲~24.5854~73.7125~Asia/Kolkata~人工湖、拉其普特宫殿和阿拉瓦利山地构成拉贾斯坦少见的水城景观~城市宫殿；皮丘拉湖；老城工坊~王国史、湖景与手工艺~湖宫与山线~王国史；水利；手工艺~Udaipur
yogyakarta~日惹~Yogyakarta~印度尼西亚~Indonesia~ID~亚洲~-7.7956~110.3695~Asia/Jakarta~爪哇王宫传统、蜡染、当代艺术和邻近古寺群让日惹兼具学院与古都气质~日惹王宫；蜡染工坊；婆罗浮屠与普兰巴南~爪哇文化、手工艺与古代宗教~蜡染纹与火山~手工艺；宗教；艺术~Yogyakarta
chiang-mai~清迈~Chiang Mai~泰国~Thailand~TH~亚洲~18.7883~98.9853~Asia/Bangkok~兰纳寺院、城墙水渠、山地文化和当代创意社区构成泰北文化中心~古城寺院；素贴山；手工艺街区~宗教建筑、地方工艺与慢旅行~兰纳屋顶与山花~宗教；手工艺；山地~Chiang_Mai
phnom-penh~金边~Phnom Penh~柬埔寨~Cambodia~KH~亚洲~11.5564~104.9282~Asia/Phnom_Penh~湄公河水系、王宫、殖民街区与二十世纪创伤记忆构成需要耐心阅读的首都~王宫；国家博物馆；吐斯廉屠杀博物馆~高棉艺术、河港与历史反思~四臂河与王宫尖顶~记忆；河流；艺术~Phnom_Penh
alexandria~亚历山大~Alexandria~埃及~Egypt~EG~非洲~31.2001~29.9187~Africa/Cairo~地中海海岸、希腊罗马遗产、图书馆意象和近代多元社区构成埃及的海洋窗口~亚历山大图书馆；盖特贝城堡；海滨大道~古代知识史、地中海与城市记忆~灯塔与海卷~古代；知识；海洋~Alexandria
luxor~卢克索~Luxor~埃及~Egypt~EG~非洲~25.6872~32.6396~Africa/Cairo~尼罗河两岸密集分布神庙、王陵和古城遗址，是理解新王国空间秩序的核心地点~卡尔纳克神庙；帝王谷；卢克索神庙~古埃及文明、考古与河谷景观~方尖碑与河舟~古代；考古；河流~Luxor
aswan~阿斯旺~Aswan~埃及~Egypt~EG~非洲~24.0889~32.8998~Africa/Cairo~尼罗河岛屿、努比亚文化、花岗岩遗址与大坝工程展示南部边疆的历史和水利变化~菲莱神庙；努比亚博物馆；象岛~努比亚文化、水利史与河上慢行~帆船与花岗岩~水利；努比亚；河流~Aswan
nairobi~内罗毕~Nairobi~肯尼亚~Kenya~KE~非洲~-1.2921~36.8219~Africa/Nairobi~铁路建城史、独立记忆、当代艺术与城市边缘野生生态形成鲜明并置~内罗毕国家博物馆；铁路博物馆；内罗毕国家公园~东非城市史、艺术与城市生态~铁路与金合欢~铁路；独立；生态~Nairobi
mombasa~蒙巴萨~Mombasa~肯尼亚~Kenya~KE~非洲~-4.0435~39.6682~Africa/Nairobi~斯瓦希里旧城、葡萄牙要塞、印度洋贸易和多元饮食留下层层海岸交流痕迹~耶稣堡；斯瓦希里老城；印度洋海岸~海洋贸易、斯瓦希里文化与建筑~珊瑚石门与帆船~贸易；海洋；多元文化~Mombasa
addis-ababa~亚的斯亚贝巴~Addis Ababa~埃塞俄比亚~Ethiopia~ET~非洲~9.032~38.7469~Africa/Addis_Ababa~高原首都以国家博物馆、泛非机构、咖啡文化和快速城市化连接古代与当代非洲~国家博物馆；非洲联盟区；咖啡文化~人类史、泛非政治与高原城市~咖啡枝与高原~人类史；泛非；现代化~Addis_Ababa
gondar~贡德尔~Gondar~埃塞俄比亚~Ethiopia~ET~非洲~12.603~37.4521~Africa/Addis_Ababa~石砌王宫群、教堂壁画和高原景观保存埃塞俄比亚帝国时期独特的都城遗产~法西尔盖比城堡群；德布雷·伯罕·塞拉西教堂；高原街区~帝国史、宗教艺术与高原文化~石堡与壁画天使~帝国史；宗教；高原~Gondar
johannesburg~约翰内斯堡~Johannesburg~南非~South Africa~ZA~非洲~-26.2041~28.0473~Africa/Johannesburg~金矿建城、种族隔离史、宪法转型和活跃创意街区共同定义南非最大都会~种族隔离博物馆；宪法山；马邦内创意区~近现代史、社会转型与城市文化~矿井架与城市网格~社会转型；记忆；工业~Johannesburg
durban~德班~Durban~南非~South Africa~ZA~非洲~-29.8587~31.0218~Africa/Johannesburg~印度洋海岸、祖鲁文化、印度裔社区和港口贸易形成温暖而多层的城市身份~金色里程海滩；夸穆赫博物馆；维多利亚市场~海岸生活、迁徙史与多元饮食~海浪与珠饰~海洋；迁徙；多元文化~Durban
pretoria~比勒陀利亚~Pretoria~南非~South Africa~ZA~非洲~-25.7479~28.2293~Africa/Johannesburg~行政建筑、蓝花楹大道、布尔历史和自由公园呈现国家权力与记忆的多种版本~联合大厦；自由公园；蓝花楹街道~政治史、纪念空间与城市花季~紫花与台阶~政治；记忆；城市景观~Pretoria
gaborone~哈博罗内~Gaborone~博茨瓦纳~Botswana~BW~非洲~-24.6282~25.9231~Africa/Gaborone~独立后规划的首都通过国家机构、当代艺术和临近自然保护区展示博茨瓦纳发展路径~三酋长纪念碑；国家博物馆；哈博罗内保护区~独立史、城市治理与自然衔接~三人铜像与旱地树~独立；治理；生态~Gaborone
victoria-falls~维多利亚瀑布城~Victoria Falls~津巴布韦~Zimbabwe~ZW~非洲~-17.9243~25.8572~Africa/Harare~城市因赞比西河巨瀑而生，但铁路遗产、峡谷生态与跨境文化让它不只是观景入口~维多利亚瀑布；赞比西峡谷；历史铁路桥~地质奇观、生态与跨境旅行~水雾与峡谷桥~自然；铁路；跨境~Victoria_Falls
harare~哈拉雷~Harare~津巴布韦~Zimbabwe~ZW~非洲~-17.8252~31.0335~Africa/Harare~林荫大道、石雕传统、国家美术馆和城市市场展现津巴布韦的当代创造力~国家美术馆；绍纳石雕；姆巴雷市场~当代非洲艺术、城市生活与历史~石雕与紫葳花~艺术；市场；当代非洲~Harare
lusaka~卢萨卡~Lusaka~赞比亚~Zambia~ZM~非洲~-15.3875~28.3228~Africa/Lusaka~独立历史、快速扩张的商业区、市场和艺术空间使卢萨卡成为理解当代赞比亚的起点~卢萨卡国家博物馆；卡宾瓦塔文化村；城市市场~独立史、手工艺与社会观察~织篮与大道~独立；手工艺；现代化~Lusaka
kampala~坎帕拉~Kampala~乌干达~Uganda~UG~非洲~0.3476~32.5825~Africa/Kampala~七丘地形、布干达王国遗产、宗教建筑和活跃市场构成东非内陆首都的层次~卡苏比王陵；国家清真寺；奥维诺市场~王国史、宗教与城市市场~丘陵与鼓~王国史；宗教；市场~Kampala
arusha~阿鲁沙~Arusha~坦桑尼亚~Tanzania~TZ~非洲~-3.3869~36.683~Africa/Dar_es_Salaam~梅鲁山脚的外交传统、咖啡农业、多族群市场和自然保护区门户角色相互交织~阿鲁沙宣言博物馆；文化遗产中心；梅鲁山景观~东非政治史、地方文化与自然旅行~山峰与咖啡果~政治；农业；自然~Arusha
dar-es-salaam~达累斯萨拉姆~Dar es Salaam~坦桑尼亚~Tanzania~TZ~非洲~-6.7924~39.2083~Africa/Dar_es_Salaam~印度洋港口、斯瓦希里文化、现代艺术和快速扩张的社区呈现坦桑尼亚城市化节奏~国家博物馆；卡里亚库市场；海滨与艺术空间~港口史、斯瓦希里文化与当代艺术~独桅帆船与城市线~海港；艺术；现代化~Dar_es_Salaam
antananarivo~塔那那利佛~Antananarivo~马达加斯加~Madagascar~MG~非洲~-18.8792~47.5079~Indian/Antananarivo~层叠稻田、红土高地、王宫遗址和密集市区展示马达加斯加独特的岛屿历史~女王宫高地；安达菲亚瓦拉特拉宫；城市梯田~岛屿王国史、高地景观与市场生活~红土屋与稻田~王国史；岛屿；农业~Antananarivo
port-louis~路易港~Port Louis~毛里求斯~Mauritius~MU~非洲~-20.1609~57.5012~Indian/Mauritius~山海夹峙的港口、契约劳工记忆、多族群市场和殖民建筑浓缩印度洋迁徙史~阿普拉瓦西码头；中央市场；炮台山~迁徙史、印度洋贸易与多元饮食~山门与港帆~迁徙；贸易；多元文化~Port_Louis
casablanca~卡萨布兰卡~Casablanca~摩洛哥~Morocco~MA~非洲~33.5731~-7.5898~Africa/Casablanca~大西洋港口、装饰艺术街区、现代主义规划和巨大清真寺展示摩洛哥的都会面貌~哈桑二世清真寺；装饰艺术中心区；中央市场~现代建筑、港口城市与都市文化~白色立面与海线~现代主义；海港；建筑~Casablanca
rabat~拉巴特~Rabat~摩洛哥~Morocco~MA~非洲~34.0209~-6.8416~Africa/Casablanca~古城、安达卢斯花园、王室与现代行政区在布雷格雷格河口形成从容首都尺度~乌达雅堡；哈桑塔；穆罕默德六世现代艺术博物馆~王朝史、花园与当代艺术~蓝白堡门与河口~王朝史；艺术；河流~Rabat
essaouira~索维拉~Essaouira~摩洛哥~Morocco~MA~非洲~31.5085~-9.7595~Africa/Casablanca~大西洋风、城墙港口、蓝白巷道和格纳瓦音乐赋予这座小城开放的跨文化气质~麦地那城墙；渔港；格纳瓦音乐传统~海港建筑、音乐与慢旅行~蓝门与海鸥~音乐；海洋；多元文化~Essaouira
abidjan~阿比让~Abidjan~科特迪瓦~Côte d’Ivoire~CI~非洲~5.36~-4.0083~Africa/Abidjan~潟湖地形、现代主义天际线、市场、音乐和当代艺术展示西非商业都会的创造力~普拉托现代建筑；文明博物馆；潟湖与市场~当代非洲、城市建筑与音乐~潟湖与高塔~现代主义；音乐；市场~Abidjan
boston~波士顿~Boston~美国~United States~US~北美洲~42.3601~-71.0589~America/New_York~殖民与革命遗址、大学群、港湾和步行社区把美国历史与知识产业紧密连接~自由之路；美术博物馆；查尔斯河~美国史、学术文化与城市步行~红砖与灯塔~历史；知识；海港~Boston
washington-dc~华盛顿~Washington, D.C.~美国~United States~US~北美洲~38.9072~-77.0369~America/New_York~国家纪念轴线、免费博物馆群和多元社区让政治制度与公共记忆可以在城市中直接观察~国家广场；史密森尼博物馆群；国会山~政治史、博物馆与公共空间~圆顶与纪念轴线~政治；博物馆；公共空间~Washington,_D.C.
philadelphia~费城~Philadelphia~美国~United States~US~北美洲~39.9526~-75.1652~America/New_York~建国遗址、工业街区、公共艺术和市场共同展示美国城市的历史连续与转型~独立厅；费城艺术博物馆；雷丁车站市场~建国史、艺术与社区饮食~自由钟与砖街~历史；艺术；市场~Philadelphia
savannah~萨凡纳~Savannah~美国~United States~US~北美洲~32.0809~-81.0912~America/New_York~规则广场、橡树林荫、港口建筑和复杂的奴隶制记忆构成美国南方独特城市纹理~历史广场体系；河街；非裔美国人遗产地~城市规划、南方史与树荫步行~橡树与方格广场~规划；记忆；海港~Savannah
charleston~查尔斯顿~Charleston~美国~United States~US~北美洲~32.7765~-79.9311~America/New_York~海港宅邸、教堂尖塔、低地饮食与非裔历史要求旅行者同时阅读美景和权力结构~历史街区；国际非裔美国人博物馆；港湾~大西洋史、建筑与非裔文化~彩屋与沼泽草~海港；记忆；建筑~Charleston,_South_Carolina
nashville~纳什维尔~Nashville~美国~United States~US~北美洲~36.1627~-86.7816~America/Chicago~乡村音乐产业、民权历史、录音棚和快速更新的街区共同塑造声音之城~乡村音乐名人堂；国家非裔美国音乐博物馆；音乐街~音乐产业、民权史与现场演出~吉他与霓虹~音乐；民权；产业~Nashville,_Tennessee
memphis~孟菲斯~Memphis~美国~United States~US~北美洲~35.1495~-90.049~America/Chicago~密西西比河、蓝调、灵魂乐和民权运动记忆在这座交通城市交汇~国家民权博物馆；太阳录音室；比尔街~音乐史、民权与河流城市~唱片与河轮~音乐；民权；河流~Memphis,_Tennessee
seattle~西雅图~Seattle~美国~United States~US~北美洲~47.6062~-122.3321~America/Los_Angeles~普吉特海湾、市场、航空与科技产业和邻近山地共同定义太平洋西北都会~派克市场；流行文化博物馆；渡轮海湾~产业创新、音乐与山海城市~渡轮与雪峰~技术；音乐；海洋~Seattle
portland-oregon~波特兰~Portland~美国~United States~US~北美洲~45.5152~-122.6784~America/Los_Angeles~河流、街车、自行车文化、独立书店和邻里商业构成强调尺度与社区的城市体验~鲍威尔书城；华盛顿公园；社区商业街~书店、城市生态与社区漫游~玫瑰与桥~文学；生态；社区~Portland,_Oregon
san-francisco~旧金山~San Francisco~美国~United States~US~北美洲~37.7749~-122.4194~America/Los_Angeles~陡坡、海湾、移民街区、社会运动和科技产业让城市景观与观念史同样醒目~金门大桥；唐人街；渡轮大厦~迁徙史、社会文化与湾区步行~雾桥与缆车~迁徙；社会运动；海湾~San_Francisco
los-angeles~洛杉矶~Los Angeles~美国~United States~US~北美洲~34.0522~-118.2437~America/Los_Angeles~电影工业、现代主义住宅、多语言社区和山海地理构成分散但极富影响力的都市~电影博物馆；盖蒂中心；多元社区市场~电影、建筑与移民文化~胶片与棕榈~电影；建筑；迁徙~Los_Angeles
santa-fe~圣菲~Santa Fe~美国~United States~US~北美洲~35.687~-105.9378~America/Denver~土坯建筑、普韦布洛文化、西班牙殖民史和当代艺术在高原光线中交汇~总督宫；峡谷路艺术区；普韦布洛文化博物馆~原住民文化、建筑与艺术~土坯墙与高原星~原住民文化；艺术；高原~Santa_Fe,_New_Mexico
toronto~多伦多~Toronto~加拿大~Canada~CA~北美洲~43.6532~-79.3832~America/Toronto~湖滨、移民社区、公共市场和多层交通网络体现加拿大最大都会的多元结构~安大略美术馆；肯辛顿市场；多伦多群岛~移民文化、艺术与湖滨城市~高塔与湖岛~迁徙；艺术；湖泊~Toronto
ottawa~渥太华~Ottawa~加拿大~Canada~CA~北美洲~45.4215~-75.6972~America/Toronto~国会山、国家博物馆、运河和双语城市生活使加拿大政治与文化制度集中可见~国会山；加拿大历史博物馆；里多运河~国家史、博物馆与双语文化~钟楼与运河~政治；语言；博物馆~Ottawa
halifax~哈利法克斯~Halifax~加拿大~Canada~CA~北美洲~44.6488~-63.5752~America/Halifax~大西洋深水港、移民与海难记忆、木屋街区和海事文化塑造加拿大东岸气质~海事博物馆；二十一号码头；滨水步道~海洋史、迁徙与港口生活~灯塔与深水港~海洋；迁徙；记忆~Halifax
victoria-bc~维多利亚~Victoria~加拿大~Canada~CA~北美洲~48.4284~-123.3656~America/Vancouver~内港、历史建筑、海岸花园和原住民文化让不列颠哥伦比亚首府兼具精致与自然~皇家不列颠哥伦比亚博物馆；内港；海岸步道~博物馆、花园与太平洋文化~内港与图腾~原住民文化；海洋；花园~Victoria_(British_Columbia)
banff~班夫~Banff~加拿大~Canada~CA~北美洲~51.1784~-115.5708~America/Edmonton~国家公园小镇被落基山、冰川河流和铁路旅游史包围，核心价值在负责任地接近高山生态~班夫公园博物馆；弓河；落基山步道~高山生态、铁路史与户外教育~雪峰与弓河~自然；铁路；生态~Banff
guadalajara~瓜达拉哈拉~Guadalajara~墨西哥~Mexico~MX~北美洲~20.6597~-103.3496~America/Mexico_City~殖民广场、壁画、龙舌兰酒文化和马里亚奇音乐共同展示哈利斯科身份~卡瓦尼亚斯救济院；历史中心；马里亚奇广场~壁画艺术、音乐与地方饮食~壁画与龙舌兰~艺术；音乐；地方传统~Guadalajara
puebla~普埃布拉~Puebla~墨西哥~Mexico~MX~北美洲~19.0414~-98.2063~America/Mexico_City~彩釉砖立面、修道院、火山背景和复杂饮食传统使普埃布拉兼具视觉与味觉辨识度~历史中心；安帕罗博物馆；乔卢拉邻近遗址~建筑、地方饮食与火山地理~彩釉砖与火山~建筑；饮食；自然~Puebla
guanajuato~瓜纳华托~Guanajuato~墨西哥~Mexico~MX~北美洲~21.019~-101.2574~America/Mexico_City~彩色山城、银矿隧道、大学文化和独立历史形成戏剧性的步行空间~地下街道；银矿遗产；阿隆迪加博物馆~矿业史、城市地形与艺术节~彩屋与隧道~工业；独立；山城~Guanajuato_City
lima~利马~Lima~秘鲁~Peru~PE~南美洲~-12.0464~-77.0428~America/Lima~太平洋沙漠海岸、殖民中心、前哥伦布遗址和多元饮食构成秘鲁首都的长期连续~历史中心；拉尔科博物馆；米拉弗洛雷斯海岸~安第斯文明、博物馆与饮食~海崖与陶纹~古代；饮食；海洋~Lima
arequipa~阿雷基帕~Arequipa~秘鲁~Peru~PE~南美洲~-16.409~-71.5375~America/Lima~白色火山岩建筑、修道院、山峰和南部安第斯饮食塑造明亮高原城市~圣卡塔利娜修道院；武器广场；米斯蒂火山景观~建筑、高原文化与火山地理~白石拱与火山~建筑；高原；自然~Arequipa
trujillo-peru~特鲁希略~Trujillo~秘鲁~Peru~PE~南美洲~-8.1091~-79.0215~America/Lima~殖民广场之外，昌昌城与莫切遗址揭示北海岸前哥伦布文明的规模~昌昌古城；太阳月亮神庙；历史中心~考古、北海岸文明与城市史~土城浮雕与海鸟~古代；考古；海岸~Trujillo_(Peru)
bogota~波哥大~Bogotá~哥伦比亚~Colombia~CO~南美洲~4.711~-74.0721~America/Bogota~安第斯高原、黄金博物馆、壁画街区和公共自行车文化构成高海拔知识都会~黄金博物馆；拉坎德拉里亚；蒙塞拉特山~博物馆、街头艺术与高原城市~金饰与山脊~艺术；高原；公共空间~Bogota
medellin~麦德林~Medellín~哥伦比亚~Colombia~CO~南美洲~6.2442~-75.5812~America/Bogota~山谷地形、公共交通、社区图书馆和花卉传统展示城市更新的复杂实践~城市缆车；记忆之家博物馆；植物园~城市转型、公共交通与社会记忆~缆车与花朵~城市转型；交通；记忆~Medellin
cali~卡利~Cali~哥伦比亚~Colombia~CO~南美洲~3.4516~-76.532~America/Bogota~萨尔萨音乐、非裔太平洋文化、河岸和现代艺术构成强烈身体节奏~萨尔萨舞校；拉泰尔图利亚博物馆；圣安东尼奥区~音乐、非裔文化与城市夜生活~舞步与河线~音乐；非洲离散；艺术~Cali
santa-marta~圣玛尔塔~Santa Marta~哥伦比亚~Colombia~CO~南美洲~11.2408~-74.199~America/Bogota~加勒比海港、泰罗纳文化、殖民历史和内华达雪山在罕见短距离内相遇~黄金博物馆泰罗纳馆；历史中心；雪山海岸~原住民文化、海港史与山海生态~雪峰与加勒比浪~原住民文化；海洋；自然~Santa_Marta
santiago~圣地亚哥~Santiago~智利~Chile~CL~南美洲~-33.4489~-70.6693~America/Santiago~安第斯山幕、共和国建筑、记忆场所和活跃文化街区呈现智利现代历史~记忆与人权博物馆；圣卢西亚山；中央市场~近现代史、城市文化与山地景观~山墙与地铁线~记忆；现代化；山地~Santiago
cordoba-argentina~科尔多瓦~Córdoba~阿根廷~Argentina~AR~南美洲~-31.4201~-64.1888~America/Argentina/Cordoba~耶稣会大学遗产、学生文化、殖民街区和周边山地使内陆城市保持思想活力~耶稣会街区；大学文化；瓜埃梅斯区~教育史、建筑与青年文化~钟塔与书页~知识；建筑；社区~Córdoba_(city,_Argentina)
mendoza~门多萨~Mendoza~阿根廷~Argentina~AR~南美洲~-32.8895~-68.8458~America/Argentina/Mendoza~灌溉水渠、林荫街道、葡萄园和安第斯山门户角色展示干旱地区的城市适应~城市水渠；葡萄酒博物馆；安第斯山景观~水利、农业文化与山地旅行~葡萄藤与雪峰~水利；农业；山地~Mendoza
salta~萨尔塔~Salta~阿根廷~Argentina~AR~南美洲~-24.7821~-65.4232~America/Argentina/Salta~殖民建筑、高原铁路、安第斯原住民遗产和民谣传统定义阿根廷西北文化~高山考古博物馆；历史中心；云端列车文化~高原考古、音乐与殖民史~高原列车与红土~考古；音乐；高原~Salta
ushuaia~乌斯怀亚~Ushuaia~阿根廷~Argentina~AR~南美洲~-54.8019~-68.303~America/Argentina/Ushuaia~比格尔海峡、监狱殖民史、火地岛森林和南极门户身份共同塑造极南城市~世界尽头博物馆；比格尔海峡；火地岛国家公园~极地史、航海与亚南极生态~灯塔与雪湾~航海；生态；边疆~Ushuaia
sao-paulo~圣保罗~São Paulo~巴西~Brazil~BR~南美洲~-23.5505~-46.6333~America/Sao_Paulo~移民社区、现代主义建筑、街头艺术和巨大文化机构构成南美洲最具密度的都会之一~圣保罗艺术博物馆；伊比拉普埃拉公园；自由区~当代艺术、移民文化与城市尺度~混凝土架与涂鸦~现代主义；迁徙；艺术~Sao_Paulo
brasilia~巴西利亚~Brasília~巴西~Brazil~BR~南美洲~-15.7939~-47.8828~America/Sao_Paulo~现代主义总体规划、纪念性建筑和塞拉多地景使首都成为观察规划理想与日常生活张力的现场~三权广场；巴西利亚大教堂；超级街区~现代主义、政治与城市规划~翼形轴线与穹顶~规划；政治；现代主义~Brasilia
recife~累西腓~Recife~巴西~Brazil~BR~南美洲~-8.0476~-34.877~America/Recife~河网、桥梁、荷兰殖民痕迹、弗雷沃音乐和东北海岸文化形成鲜明节奏~老累西腓；卡伊斯杜塞尔唐博物馆；河岸桥梁~东北历史、音乐与水城景观~彩伞与桥~音乐；河流；历史~Recife
olinda~奥林达~Olinda~巴西~Brazil~BR~南美洲~-8.0089~-34.8553~America/Recife~山坡彩屋、巴洛克教堂、艺术家工坊和狂欢节巨偶形成紧凑而绚丽的历史城镇~历史中心；教堂群；巨偶工坊~巴洛克建筑、工艺与节庆~彩屋与巨偶~节庆；艺术；建筑~Olinda
belo-horizonte~贝洛奥里藏特~Belo Horizonte~巴西~Brazil~BR~南美洲~-19.9167~-43.9345~America/Sao_Paulo~规划大道、潘普利亚现代建筑、市场饮食和矿区文化展示巴西内陆现代化~潘普利亚建筑群；中央市场；自由广场~现代主义、地方饮食与规划史~曲线屋顶与山线~现代主义；饮食；规划~Belo_Horizonte
manaus~马瑙斯~Manaus~巴西~Brazil~BR~南美洲~-3.119~-60.0217~America/Manaus~橡胶繁荣留下的剧院、黑河港口、河流交汇和亚马孙研究机构构成雨林都会~亚马孙剧院；两河交汇；亚马孙博物馆~橡胶史、河流生态与雨林城市~剧院穹顶与黑水~生态；河流；工业史~Manaus
belem~贝伦~Belém~巴西~Brazil~BR~南美洲~-1.4558~-48.4902~America/Belem~亚马孙河口、香料市场、殖民街区和雨林食材使贝伦成为大河与大西洋的文化接口~维罗佩索市场；老城；河口博物馆空间~亚马孙饮食、港口史与河口生态~市场棚与河果~饮食；海港；生态~Belem
asuncion~亚松森~Asunción~巴拉圭~Paraguay~PY~南美洲~-25.2637~-57.5759~America/Asuncion~巴拉圭河、独立建筑、瓜拉尼语言和滨水更新呈现南美内陆国家的历史尺度~英雄祠；河湾滨水；黏土博物馆~语言文化、国家史与河流城市~河湾与南迪绣纹~语言；河流；独立~Asuncion
paramaribo~帕拉马里博~Paramaribo~苏里南~Suriname~SR~南美洲~5.852~-55.2038~America/Paramaribo~木结构殖民建筑、犹太与穆斯林遗产、多族群饮食和热带河岸浓缩独特迁徙史~历史内城；泽兰迪亚堡；中央市场~木建筑、多元宗教与河港文化~白木屋与棕榈~迁徙；宗教；建筑~Paramaribo
brisbane~布里斯班~Brisbane~澳大利亚~Australia~AU~大洋洲~-27.4698~153.0251~Australia/Brisbane~河流弯道、亚热带公共空间、昆士兰建筑和当代艺术构成轻盈城市节奏~南岸；昆士兰文化中心；城市河渡~河流城市、当代艺术与亚热带生活~河弯与高脚屋~河流；艺术；气候~Brisbane
canberra~堪培拉~Canberra~澳大利亚~Australia~AU~大洋洲~-35.2809~149.13~Australia/Sydney~人工湖、国家博物馆、纪念空间和丛林保护区展示规划首都如何组织国家叙事~国会大厦；澳大利亚战争纪念馆；格里芬湖~国家史、建筑与规划景观~湖轴与旗杆~政治；博物馆；规划~Canberra
darwin~达尔文~Darwin~澳大利亚~Australia~AU~大洋洲~-12.4634~130.8456~Australia/Darwin~热带海港、原住民文化、二战记忆和多次灾后重建塑造澳大利亚北端城市~北领地博物馆；二战遗址；明迪尔海滩市场~原住民文化、战争史与热带适应~季风云与海港~原住民文化；重建；海洋~Darwin
cairns~凯恩斯~Cairns~澳大利亚~Australia~AU~大洋洲~-16.9186~145.7781~Australia/Brisbane~珊瑚海、热带雨林、原住民文化和滨海城市共同构成两项世界遗产之间的入口~凯恩斯滨海大道；雨林文化中心；大堡礁门户~海洋生态、雨林与文化教育~珊瑚与蕨叶~海洋；生态；原住民文化~Cairns
fremantle~弗里曼特尔~Fremantle~澳大利亚~Australia~AU~大洋洲~-32.0569~115.7439~Australia/Perth~石灰岩港区、监狱遗产、海事博物馆和市场保留西澳门户城市的独立气质~弗里曼特尔监狱；海事博物馆；卡布奇诺街区~海事史、建筑与港口生活~锚与石灰岩墙~海洋；移民；建筑~Fremantle
alice-springs~爱丽斯泉~Alice Springs~澳大利亚~Australia~AU~大洋洲~-23.698~133.8807~Australia/Darwin~红土沙漠、阿伦特文化、内陆通信史和艺术中心使小城成为理解澳洲腹地的关键节点~阿拉伦文化中心；皇家飞行医疗服务博物馆；西麦克唐奈山脉~沙漠文化、通信史与原住民艺术~红土与无线电塔~原住民文化；沙漠；通信~Alice_Springs
geelong~吉朗~Geelong~澳大利亚~Australia~AU~大洋洲~-38.1499~144.3617~Australia/Melbourne~科里奥湾、羊毛工业遗产、海滨公共艺术和通往大洋路的位置定义维州第二城~国家羊毛博物馆；海滨木偶柱；艺术区~工业史、海湾生活与区域旅行~羊毛纹与海湾~工业；艺术；海洋~Geelong
newcastle-australia~纽卡斯尔~Newcastle~澳大利亚~Australia~AU~大洋洲~-32.9283~151.7817~Australia/Sydney~煤港工业、冲浪海岸、海滨步道和艺术空间展示资源城市的持续转型~纽卡斯尔博物馆；海岸步道；港口遗产~工业转型、海岸与公共文化~煤塔与海浪~工业；海洋；城市转型~Newcastle,_New_South_Wales
gold-coast~黄金海岸~Gold Coast~澳大利亚~Australia~AU~大洋洲~-28.0167~153.4~Australia/Brisbane~长海滩、高层度假区、冲浪文化与腹地雨林构成商业旅游之外的多样环境~冲浪者天堂；伯利角；内陆雨林~海岸文化、城市旅游与生态转换~冲浪线与雨林叶~海洋；旅游；生态~Gold_Coast
dunedin~达尼丁~Dunedin~新西兰~New Zealand~NZ~大洋洲~-45.8788~170.5028~Pacific/Auckland~苏格兰移民建筑、大学文化、港湾和奥塔哥半岛野生生态共同塑造南岛学术城市~奥塔哥博物馆；火车站；奥塔哥半岛~移民史、建筑与海岸生态~石塔与信天翁~迁徙；知识；生态~Dunedin
queenstown~皇后镇~Queenstown~新西兰~New Zealand~NZ~大洋洲~-45.0312~168.6626~Pacific/Auckland~瓦卡蒂普湖、南阿尔卑斯山、毛利地名和探险旅游共同塑造高强度山地目的地~瓦卡蒂普湖；皇后镇山步道；历史采金地~山地景观、户外文化与旅游治理~湖峰与缆车~自然；旅游；毛利文化~Queenstown_(New_Zealand)
rotorua~罗托鲁瓦~Rotorua~新西兰~New Zealand~NZ~大洋洲~-38.1368~176.2497~Pacific/Auckland~地热活动、毛利文化机构、湖泊和森林让自然过程与活态文化同时可见~地热谷；毛利文化中心；红木森林~地质、毛利文化与森林活动~蒸汽与银蕨~地质；毛利文化；自然~Rotorua
napier~内皮尔~Napier~新西兰~New Zealand~NZ~大洋洲~-39.4928~176.912~Pacific/Auckland~地震重建后的装饰艺术街区、海滨与霍克湾农业形成统一而易读的城市风格~装饰艺术中心；海滨长廊；霍克湾博物馆~重建史、建筑与地方农业~日光纹与海堤~重建；建筑；农业~Napier
nadi~楠迪~Nadi~斐济~Fiji~FJ~大洋洲~-17.7765~177.4356~Pacific/Fiji~多族群市场、印度教寺庙、甘蔗地区与岛屿交通门户角色展示斐济日常社会~楠迪市场；斯里·湿婆·苏布拉马尼亚神庙；沉睡巨人花园~多元文化、市场与岛屿旅行准备~花环与蔗叶~多元文化；市场；岛屿~Nadi
apia~阿皮亚~Apia~萨摩亚~Samoa~WS~大洋洲~-13.8507~-171.7514~Pacific/Apia~海港、萨摩亚村社文化、文学记忆和殖民历史共同构成波利尼西亚首都~萨摩亚博物馆；罗伯特·路易斯·史蒂文森故居；海滨~波利尼西亚文化、文学与海港史~海港与树皮布纹~文学；海洋；社区~Apia
`, CITY_FIELDS, "city");

const GERMAN_FIELDS = Object.freeze([
  "level", "kind", "slug", "german", "chinese", "exampleGerman", "exampleChinese", "themeTags", "sourceKey"
]);

const GERMAN_EXTENSION_ROWS = rows(String.raw`
A1~表达~guten-tag-formell~Guten Tag!~您好！~Guten Tag, Frau Keller!~您好，凯勒女士！~问候；礼貌~goethe
A1~表达~auf-wiedersehen-formell~Auf Wiedersehen!~再见！~Auf Wiedersehen, bis nächste Woche!~再见，下周见！~告别；时间~goethe
A1~表达~entschuldigung-frage~Entschuldigung, …~打扰一下；对不起……~Entschuldigung, ist dieser Platz noch frei?~打扰一下，这个位子还空着吗？~礼貌；提问~goethe
A1~表达~bitte-sehr~Bitte sehr.~给您；不客气。~Hier ist Ihr Kaffee, bitte sehr.~这是您的咖啡，请拿好。~服务；礼貌~goethe
A1~表达~gern-geschehen~Gern geschehen.~不用谢。~Gern geschehen, ich helfe Ihnen jederzeit.~不用谢，我随时愿意帮您。~回应；礼貌~goethe
A1~表达~ich-heisse~Ich heiße …~我叫……~Ich heiße Mei und wohne in Köln.~我叫梅，住在科隆。~介绍；居住~goethe
A1~表达~woher-kommen-sie~Woher kommen Sie?~您来自哪里？~Woher kommen Sie, und welche Sprachen sprechen Sie?~您来自哪里，会说哪些语言？~介绍；语言~goethe
A1~表达~ich-komme-aus~Ich komme aus …~我来自……~Ich komme aus China und lerne seit kurzem Deutsch.~我来自中国，最近开始学德语。~介绍；学习~goethe
A1~表达~sprechen-sie-englisch~Sprechen Sie Englisch?~您会说英语吗？~Sprechen Sie Englisch oder vielleicht Chinesisch?~您会说英语或者中文吗？~语言；求助~goethe
A1~表达~ein-bisschen-deutsch~Ich verstehe ein bisschen Deutsch.~我能听懂一点德语。~Ich verstehe ein bisschen Deutsch, aber bitte sprechen Sie langsam.~我能听懂一点德语，不过请您说慢一些。~语言；沟通~goethe
A1~表达~bitte-buchstabieren~Können Sie das bitte buchstabieren?~您能拼一下吗？~Können Sie den Straßennamen bitte buchstabieren?~您能把街道名称拼一下吗？~拼写；求助~goethe
A1~表达~wie-schreibt-man~Wie schreibt man das?~这个怎么写？~Wie schreibt man Ihren Familiennamen?~您的姓怎么写？~拼写；提问~goethe
A1~表达~ich-suche~Ich suche …~我在找……~Ich suche die nächste Bushaltestelle.~我在找最近的公交车站。~寻找；交通~goethe
A1~表达~moechte-bezahlen~Ich möchte bezahlen.~我想结账。~Ich möchte mit Karte bezahlen.~我想用卡付款。~购物；支付~goethe
A1~表达~zahlen-bitte~Zahlen, bitte!~请结账！~Zahlen, bitte, wir müssen gleich gehen.~请结账，我们马上得走了。~餐馆；时间~goethe
A1~表达~haben-sie~Haben Sie …?~您有……吗？~Haben Sie diesen Reiseführer auch auf Deutsch?~这本旅行指南您有德语版吗？~购物；提问~goethe
A1~表达~wo-kann-ich~Wo kann ich …?~我在哪里可以……？~Wo kann ich hier eine Fahrkarte kaufen?~我在这里哪里可以买车票？~地点；交通~goethe
A1~表达~kostet-zusammen~Wie viel kostet das zusammen?~这些一共多少钱？~Wie viel kosten das Brot und der Käse zusammen?~面包和奶酪一共多少钱？~购物；数字~goethe
A1~表达~wann-oeffnet~Um wie viel Uhr öffnet …?~……几点开门？~Um wie viel Uhr öffnet das Museum morgen?~博物馆明天几点开门？~时间；文化~goethe
A1~表达~heute-passt~Heute passt es gut.~今天合适。~Heute passt es gut, aber morgen bin ich beschäftigt.~今天合适，不过明天我有事。~安排；时间~goethe
A1~表达~morgen-zeit~Morgen habe ich Zeit.~我明天有时间。~Morgen habe ich nach drei Uhr Zeit.~我明天下午三点以后有时间。~安排；时间~goethe
A1~表达~gleich-zurueck~Ich bin gleich zurück.~我马上回来。~Warten Sie bitte hier, ich bin gleich zurück.~请在这里等，我马上回来。~等待；时间~goethe
A1~表达~schoenen-tag~Einen schönen Tag noch!~祝您今天愉快！~Vielen Dank und einen schönen Tag noch!~非常感谢，祝您今天愉快！~告别；礼貌~goethe
A1~表达~gute-reise~Gute Reise!~旅途愉快！~Gute Reise und kommen Sie sicher an!~旅途愉快，祝您平安到达！~旅行；祝愿~goethe
A1~表达~zum-wohl~Zum Wohl!~干杯；祝健康！~Zum Wohl und auf einen schönen Abend!~干杯，祝今晚愉快！~社交；祝愿~goethe
A1~词汇~bahnsteig~der Bahnsteig~站台~Der Zug nach Bonn fährt von Bahnsteig vier ab.~开往波恩的火车从四号站台发车。~铁路；地点~duden
A1~词汇~fahrkarte-neu~die Fahrkarte~车票~Meine Fahrkarte gilt auch für den Bus.~我的车票也适用于公交车。~交通；票务~duden
A1~词汇~koffer~der Koffer~行李箱~Der blaue Koffer ist sehr schwer.~这个蓝色行李箱很重。~旅行；物品~duden
A1~词汇~stadtplan~der Stadtplan~城市地图~Auf dem Stadtplan sehe ich drei Museen.~我在城市地图上看到三座博物馆。~城市；方向~duden
A1~词汇~baeckerei~die Bäckerei~面包店~Die Bäckerei öffnet schon um sechs Uhr.~这家面包店六点就开门。~饮食；地点~duden
A1~词汇~gemuese~das Gemüse~蔬菜~Wir kaufen frisches Gemüse auf dem Markt.~我们在市场买新鲜蔬菜。~营养；市场~duden
A1~词汇~flasche~die Flasche~瓶子~Bitte bringen Sie eine Flasche Wasser mit.~请带一瓶水来。~物品；饮水~duden
A1~词汇~regenschirm~der Regenschirm~雨伞~Heute brauche ich meinen Regenschirm.~我今天需要带雨伞。~天气；物品~duden
A1~词汇~jacke~die Jacke~夹克；外套~Am Abend ziehe ich eine warme Jacke an.~晚上我会穿一件暖和的外套。~衣物；天气~duden
A1~词汇~apotheke~die Apotheke~药店~Die Apotheke liegt neben dem Rathaus.~药店在市政厅旁边。~健康；地点~duden
A1~词汇~rathaus~das Rathaus~市政厅~Vor dem Rathaus beginnt die Stadtführung.~城市导览从市政厅前开始。~城市；公共建筑~duden
A1~词汇~bruecke~die Brücke~桥~Wir gehen zu Fuß über die alte Brücke.~我们步行穿过那座老桥。~城市；步行~duden
A1~词汇~platz-stadt~der Platz~广场~Auf dem Platz findet heute ein Markt statt.~广场上今天有集市。~公共空间；市场~duden
A1~词汇~kreuzung~die Kreuzung~十字路口~An der nächsten Kreuzung gehen Sie links.~请在下一个十字路口左转。~方向；道路~duden
A1~词汇~ampel~die Ampel~交通信号灯~Die Ampel ist rot, deshalb warten wir.~信号灯是红色的，所以我们等一下。~交通；安全~duden
A1~词汇~aufzug~der Aufzug~电梯~Der Aufzug fährt bis in den fünften Stock.~电梯可以到五楼。~建筑；无障碍~duden
A1~词汇~treppe~die Treppe~楼梯~Die Treppe zum Bahnsteig ist dort hinten.~通往站台的楼梯在后面。~建筑；交通~duden
A1~词汇~stockwerk~das Stockwerk~楼层~Unser Zimmer liegt im zweiten Stockwerk.~我们的房间在三楼。~建筑；住宿~duden
A1~词汇~kalender~der Kalender~日历~Der Termin steht schon in meinem Kalender.~这个预约已经记在我的日历里。~时间；计划~duden
A1~词汇~wochentag~der Wochentag~工作日；星期中的一天~An welchem Wochentag ist das Museum geschlossen?~博物馆星期几闭馆？~时间；文化~duden
A1~词汇~vormittag~der Vormittag~上午~Am Vormittag besuche ich den Markt.~我上午去逛市场。~时间；市场~duden
A1~词汇~nachmittag~der Nachmittag~下午~Heute Nachmittag lernen wir zusammen.~今天下午我们一起学习。~时间；学习~duden
A1~词汇~abend~der Abend~晚上~Am Abend ist die Altstadt ruhig.~晚上老城很安静。~时间；城市~duden
A1~词汇~wochenende~das Wochenende~周末~Am Wochenende fahren wir an den See.~周末我们去湖边。~时间；旅行~duden
A1~词汇~telefonnummer~die Telefonnummer~电话号码~Bitte schreiben Sie Ihre Telefonnummer hierhin.~请把您的电话号码写在这里。~联系；信息~duden
A1~语法~personalpronomen-nominativ~主格人称代词~ich、du、er、sie、es、wir、ihr、Sie 作句子主语~Wir lernen heute die neuen Wörter.~我们今天学习这些新单词。~代词；主语~grammis
A1~语法~regelmaessige-endungen~规则动词现在时词尾~-e、-st、-t、-en 随主语变化~Du arbeitest heute von zu Hause.~你今天在家工作。~动词；现在时~grammis
A1~语法~stamm-auf-t-d~词干以 -t 或 -d 结尾~部分现在时词尾前增加 e 便于发音~Er wartet jeden Morgen auf den Bus.~他每天早晨等公交车。~动词；发音~grammis
A1~语法~haben-akkusativ~haben 后的宾格~haben 常带第四格事物~Wir haben einen kleinen Balkon.~我们有一个小阳台。~宾格；拥有~grammis
A1~语法~kein-negativartikel~否定冠词 kein~kein 按不定冠词方式变化~Im Zimmer gibt es keinen Fernseher.~房间里没有电视。~否定；冠词~grammis
A1~语法~nicht-satzende~nicht 的基本位置~否定整体陈述时通常靠近句末~Der Zug kommt heute nicht.~火车今天不来。~否定；词序~grammis
A1~语法~plural-ohne-artikel~复数零冠词~泛指复数名词时常不用冠词~Kinder spielen im Park.~孩子们在公园里玩。~复数；冠词~grammis
A1~语法~es-gibt-akkusativ~es gibt 加宾格~表示某处存在某物~In der Nähe gibt es einen Supermarkt.~附近有一家超市。~存在；宾格~grammis
A1~语法~moechten-form~möchten 的礼貌愿望~möchten 加不定式或宾语表达较礼貌的愿望~Ich möchte morgen das Schloss besuchen.~我想明天参观城堡。~情态；礼貌~grammis
A1~语法~koennen-faehigkeit~können 表能力~变位后的 können 位于第二位，实义动词在句末~Meine Schwester kann gut schwimmen.~我妹妹游泳游得很好。~情态；能力~grammis
A1~语法~muessen-pflicht~müssen 表必要~用于说明必须完成的行动~Wir müssen jetzt zum Bahnhof gehen.~我们现在必须去火车站。~情态；义务~grammis
A1~语法~wollen-plan~wollen 表计划~wollen 比 möchten 更直接地表达意愿~Am Samstag wollen wir wandern.~我们星期六想去徒步。~情态；计划~grammis
A1~语法~imperativ-du~du 命令式~对熟悉的一人提出简短请求或指令~Komm bitte pünktlich zum Treffpunkt!~请准时到集合地点！~命令式；时间~grammis
A1~语法~imperativ-ihr~ihr 命令式~词形通常与 ihr 现在时相同但省略主语~Nehmt bitte eure Fahrkarten mit!~请你们带上车票！~命令式；旅行~grammis
A1~语法~possessiv-mein-dein~mein 与 dein~物主冠词按名词性、数和格变化~Ist das dein roter Rucksack?~那是你的红色背包吗？~物主；物品~grammis
A1~语法~von-bis-zeit~von … bis … 表时间范围~两个介词共同标出起止时间~Die Ausstellung ist von zehn bis achtzehn Uhr geöffnet.~展览从十点开放到十八点。~时间；介词~grammis
A1~语法~am-wochentag~am 加星期和日期~am 用于星期、具体日期和一天时段~Am Montag beginnt der neue Kurs.~新课程星期一开始。~时间；介词~grammis
A1~语法~im-monat-jahreszeit~im 加月份或季节~im 用于月份、季节和年份较长时段~Im Oktober sind die Wälder besonders bunt.~十月的森林色彩格外丰富。~时间；自然~grammis
A1~语法~um-uhrzeit~um 加钟点~具体时刻前使用 um~Der Film beginnt um halb acht.~电影七点半开始。~时间；钟点~grammis
A1~语法~nach-hause-zu-hause~nach Hause 与 zu Hause~前者表示方向，后者表示所在位置~Nach dem Kurs gehe ich direkt nach Hause.~下课后我直接回家。~方向；地点~grammis
A1~语法~gern-lieber~gern 与 lieber~gern 表喜欢做，lieber 表比较后的偏好~Ich trinke gern Tee, aber heute lieber Wasser.~我喜欢喝茶，不过今天更想喝水。~偏好；比较~grammis
A1~语法~denn-fragepartikel~疑问句中的 denn~denn 可让真实询问更自然，不改变基本语序~Wo wohnst du denn jetzt?~你现在住在哪里呀？~疑问；语用~grammis
A1~语法~wer-wen~wer 与 wen~wer 询问主格人物，wen 询问宾格人物~Wen besuchst du am Wochenende?~你周末去看谁？~疑问；格~grammis
A1~语法~wo-wohin~wo 与 wohin~wo 询问位置，wohin 询问移动目的地~Wohin fährt dieser Bus?~这辆公交车开往哪里？~疑问；方向~grammis
A1~语法~satzklammer-modal~情态动词句框~变位情态动词在第二位，不定式位于句末~Wir können die Tickets online kaufen.~我们可以在线买票。~词序；情态~grammis
A2~表达~ich-wuerde-gern~Ich würde gern …~我很想……~Ich würde gern einen Termin für Freitag vereinbaren.~我想预约星期五的时间。~礼貌；安排~goethe
A2~表达~waere-es-moeglich~Wäre es möglich, …?~是否可以……？~Wäre es möglich, das Zimmer eine Nacht länger zu behalten?~可以把房间多保留一晚吗？~礼貌；住宿~goethe
A2~表达~koennte-ich-bitte~Könnte ich bitte …?~我可以……吗？~Könnte ich bitte eine Kopie der Rechnung bekommen?~我可以拿一份账单副本吗？~请求；支付~goethe
A2~表达~leider-klappt-nicht~Leider klappt es nicht.~很遗憾，这行不通。~Am Dienstag klappt es leider nicht, weil ich arbeite.~星期二很遗憾不行，因为我要工作。~拒绝；安排~goethe
A2~表达~anderer-termin~Passt Ihnen ein anderer Termin?~另一个时间您合适吗？~Passt Ihnen ein anderer Termin am Nachmittag?~下午换一个时间您合适吗？~协商；时间~goethe
A2~表达~verspaete-mich~Ich verspäte mich um …~我会迟到……~Ich verspäte mich um ungefähr zehn Minuten.~我大约会迟到十分钟。~时间；通知~goethe
A2~表达~zug-faellt-aus~Der Zug fällt aus.~火车停运了。~Der Zug fällt heute wegen des Sturms aus.~今天火车因暴风雨停运。~交通；天气~goethe
A2~表达~anschluss-verpasst~Ich habe den Anschluss verpasst.~我没赶上换乘。~Ich habe in Köln den Anschluss nach Aachen verpasst.~我在科隆没赶上去亚琛的换乘车。~交通；问题~goethe
A2~表达~koennen-empfehlen~Was können Sie empfehlen?~您能推荐什么？~Was können Sie für einen ruhigen Nachmittag empfehlen?~您能为一个安静的下午推荐什么？~推荐；旅行~goethe
A2~表达~interessiere-mich~Ich interessiere mich für …~我对……感兴趣。~Ich interessiere mich besonders für Stadtgeschichte.~我对城市史尤其感兴趣。~兴趣；历史~goethe
A2~表达~habe-lust~Ich habe Lust auf …~我想要……；我有兴致……~Heute habe ich Lust auf einen langen Spaziergang.~我今天想散一会儿步。~愿望；步行~goethe
A2~表达~keine-lust~Ich habe keine Lust, …~我不想……~Bei diesem Regen habe ich keine Lust, draußen zu essen.~下这么大雨，我不想在户外吃饭。~偏好；天气~goethe
A2~表达~meiner-meinung-a2~Meiner Meinung nach …~依我看……~Meiner Meinung nach ist der frühere Zug sicherer.~依我看，坐更早的火车更稳妥。~观点；决策~goethe
A2~表达~finde-dass~Ich finde, dass …~我认为……~Ich finde, dass dieses Viertel sehr lebendig ist.~我觉得这个街区很有活力。~观点；城市~goethe
A2~表达~stimmt-genau~Das stimmt genau.~这完全正确。~Das stimmt genau, der Eingang liegt auf der Rückseite.~完全正确，入口就在后面。~赞同；方向~goethe
A2~表达~nicht-ganz-sicher~Ich bin nicht ganz sicher.~我不完全确定。~Ich bin nicht ganz sicher, ob das Museum montags öffnet.~我不太确定博物馆星期一是否开放。~不确定性；文化~goethe
A2~表达~kommt-mir-bekannt~Das kommt mir irgendwie bekannt vor.~这让我觉得有些似曾相识。~Der Name kommt mir bekannt vor, aber ich kenne das Buch nicht.~这个名字我觉得熟悉，但我没读过那本书。~记忆；图书~goethe
A2~表达~erinnere-mich~Ich erinnere mich an …~我记得……~Ich erinnere mich noch gut an unsere erste Reise.~我还清楚记得我们的第一次旅行。~记忆；旅行~goethe
A2~表达~habe-vergessen~Ich habe vergessen, …~我忘了……~Ich habe vergessen, die Datei zu speichern.~我忘记保存文件了。~记忆；技术~goethe
A2~表达~kein-problem-a2~Das ist kein Problem.~这没问题。~Das ist kein Problem, wir können die Route ändern.~这没问题，我们可以改变路线。~安慰；计划~goethe
A2~表达~macht-nichts~Das macht nichts.~没关系。~Das macht nichts, Fehler gehören zum Lernen.~没关系，犯错是学习的一部分。~安慰；学习~goethe
A2~表达~pass-auf~Pass auf dich auf!~照顾好自己！~Pass auf dich auf und schreib mir, wenn du angekommen bist!~照顾好自己，到了给我写信！~关心；旅行~goethe
A2~表达~herzlichen-glueckwunsch~Herzlichen Glückwunsch!~衷心祝贺！~Herzlichen Glückwunsch zur bestandenen Prüfung!~祝贺你通过考试！~祝贺；学习~goethe
A2~表达~gute-besserung-neu~Ich wünsche dir gute Besserung.~祝你早日康复。~Ich wünsche dir gute Besserung und viel Ruhe.~祝你早日康复并好好休息。~健康；祝愿~goethe
A2~表达~druecke-daumen~Ich drücke dir die Daumen.~我祝你好运。~Für dein Gespräch morgen drücke ich dir die Daumen.~祝你明天的面谈顺利。~祝愿；工作~goethe
A2~词汇~umsteigen~umsteigen~换乘~In Hannover müssen wir in einen Regionalzug umsteigen.~我们必须在汉诺威换乘一列区域火车。~交通；行动~duden
A2~词汇~reservierung~die Reservierung~预订~Unsere Reservierung gilt für zwei Personen.~我们的预订是两个人的。~住宿；计划~duden
A2~词汇~ausweis~der Ausweis~身份证件~Beim Einchecken muss ich meinen Ausweis zeigen.~办理入住时我必须出示身份证件。~证件；住宿~duden
A2~词汇~gepaeck~das Gepäck~行李~Das Gepäck kann bis zum Abend hier bleiben.~行李可以在这里寄存到晚上。~旅行；物品~duden
A2~词汇~ausflug~der Ausflug~短途旅行~Am Sonntag machen wir einen Ausflug an die Küste.~星期日我们去海岸短途旅行。~旅行；自然~duden
A2~词汇~aussichtspunkt~der Aussichtspunkt~观景点~Vom Aussichtspunkt sieht man das ganze Tal.~从观景点能看到整个山谷。~自然；视觉~duden
A2~词汇~eintrittskarte~die Eintrittskarte~门票~Die Eintrittskarte können Sie online herunterladen.~门票可以在线下载。~文化；票务~duden
A2~词汇~oeffnungszeit~die Öffnungszeit~开放时间~Die Öffnungszeit ändert sich im Winter.~开放时间在冬季会变化。~时间；文化~duden
A2~词汇~fuehrung~die Führung~导览~Die Führung durch das Schloss dauert neunzig Minuten.~城堡导览持续九十分钟。~文化；学习~duden
A2~词汇~ausstellung~die Ausstellung~展览~Die neue Ausstellung beschäftigt sich mit Fotografie.~新展览关注摄影。~艺术；视觉~duden
A2~词汇~veranstaltung~die Veranstaltung~活动~Für die Veranstaltung braucht man keine Anmeldung.~参加这个活动不需要报名。~公共生活；计划~duden
A2~词汇~anmeldung~die Anmeldung~报名；登记~Die Anmeldung zum Sprachkurs endet morgen.~语言课程报名明天截止。~学习；时间~duden
A2~词汇~versicherung~die Versicherung~保险~Die Versicherung übernimmt nicht alle Reisekosten.~保险并不承担全部旅行费用。~旅行；风险~duden
A2~词汇~verletzung~die Verletzung~受伤；伤情~Wegen einer kleinen Verletzung macht sie heute Pause.~因为轻微受伤，她今天休息。~健康；运动~duden
A2~词汇~erklaerung~die Erklärung~解释；说明~Seine Erklärung war kurz und verständlich.~他的解释简短易懂。~沟通；理解~duden
A2~词汇~erlaubnis~die Erlaubnis~许可~Zum Fotografieren brauchen wir eine Erlaubnis.~拍照需要得到许可。~礼仪；规则~duden
A2~词汇~verbot~das Verbot~禁令~Das Verbot schützt die Pflanzen im Reservat.~这项禁令保护自然保护区中的植物。~规则；自然~duden
A2~词汇~abfall~der Abfall~垃圾；废弃物~Bitte nehmen Sie Ihren Abfall wieder mit.~请把自己的垃圾带走。~环境；责任~duden
A2~词汇~mehrwegflasche~die Mehrwegflasche~可重复使用的瓶子~Eine Mehrwegflasche spart unterwegs viel Plastik.~可重复使用的瓶子能在旅途中减少很多塑料。~环境；旅行~duden
A2~词汇~nachbarschaft~die Nachbarschaft~邻里；街区~In dieser Nachbarschaft gibt es viele kleine Läden.~这个街区有许多小商店。~社区；城市~duden
A2~词汇~verkehrsmittel~das Verkehrsmittel~交通工具~Welches Verkehrsmittel ist am Abend am zuverlässigsten?~晚上哪种交通工具最可靠？~交通；选择~duden
A2~词汇~fahrgemeinschaft~die Fahrgemeinschaft~拼车；共乘~Unsere Fahrgemeinschaft fährt jeden Morgen um sieben.~我们的拼车每天早晨七点出发。~交通；社区~duden
A2~词汇~umleitung~die Umleitung~绕行路线~Wegen der Baustelle gibt es eine Umleitung.~因为施工，目前需要绕行。~道路；变化~duden
A2~词汇~baustelle~die Baustelle~施工现场~Die Baustelle vor dem Bahnhof dauert noch zwei Wochen.~火车站前的施工还要持续两周。~城市；时间~duden
A2~词汇~fundbuero~das Fundbüro~失物招领处~Mein Schlüssel wurde im Fundbüro abgegeben.~我的钥匙被交到了失物招领处。~物品；公共服务~duden
A2~语法~perfekt-haben-bewegung~完成时助动词 haben~多数动词在口语过去时中与 haben 构成完成时~Wir haben gestern das Technikmuseum besucht.~我们昨天参观了科技博物馆。~过去；动词~grammis
A2~语法~perfekt-sein-wechsel~完成时助动词 sein~表示位置或状态变化的部分动词与 sein 构成完成时~Der Bus ist zehn Minuten später angekommen.~公交车晚到了十分钟。~过去；交通~grammis
A2~语法~partizip-trennbar~可分动词第二分词~ge 通常置于前缀和词干之间~Ich habe die Tür früh zugemacht.~我很早就关了门。~过去；构词~grammis
A2~语法~partizip-untrennbar~不可分前缀第二分词~be-、ver-、er- 等不可分前缀后通常不加 ge~Wir haben die Route verändert.~我们改变了路线。~过去；构词~grammis
A2~语法~praeteritum-modal-a2~情态动词过去时~konnte、musste、wollte 等在叙述中常直接使用~Früher konnte ich jeden Tag mit dem Rad fahren.~以前我每天都能骑车。~过去；能力~grammis
A2~语法~weil-kausal~weil 引导具体原因~weil 引导的从句把变位动词放到末尾~Wir bleiben drinnen, weil es stark regnet.~我们待在室内，因为雨下得很大。~原因；天气~grammis
A2~语法~dass-objektsatz~dass 宾语从句~dass 从句可承载被认为、知道或说明的内容~Ich weiß, dass der letzte Bus um elf fährt.~我知道末班公交车十一点发车。~从句；信息~grammis
A2~语法~wenn-wiederholt~wenn 表重复条件~过去或现在反复发生的情形常用 wenn~Wenn ich in Berlin bin, besuche ich dieses Café.~每次我在柏林都会去这家咖啡馆。~条件；习惯~grammis
A2~语法~als-einmalig~als 表过去一次情形~过去仅发生一次的背景从句通常用 als~Als ich das erste Mal dort war, lag Schnee.~我第一次到那里时，地上有雪。~过去；时间~grammis
A2~语法~ob-indirekt~ob 间接是否问句~ob 引导不知道答案为是或否的间接疑问~Können Sie prüfen, ob das Fenster geschlossen ist?~您能检查一下窗户是否关好了吗？~疑问；核查~grammis
A2~语法~indirekte-w-frage~W词间接问句~疑问词保留，从句动词置于末尾~Ich möchte wissen, wann die Führung beginnt.~我想知道导览何时开始。~疑问；时间~grammis
A2~语法~relativ-nominativ-akk~主格与宾格关系代词~关系代词的格由它在从句中的功能决定~Das ist der Park, den wir gestern besucht haben.~这就是我们昨天去过的公园。~关系从句；地点~grammis
A2~语法~dativ-person~第三格人物宾语~helfen、danken、gefallen 等动词要求第三格~Die Mitarbeiterin hilft einem älteren Besucher.~工作人员帮助一位年长访客。~第三格；人物~grammis
A2~语法~wechselpraeposition-richtung~双向介词表方向~回答 wohin 时，in、auf、an 等常接第四格~Wir stellen die Fahrräder in den Hof.~我们把自行车停到院子里。~介词；方向~grammis
A2~语法~wechselpraeposition-ort~双向介词表位置~回答 wo 时，双向介词通常接第三格~Die Fahrräder stehen im Hof.~自行车停在院子里。~介词；地点~grammis
A2~语法~adjektiv-ohne-artikel~无冠词形容词词尾~没有冠词提示时，形容词承担更多格与性信息~Frisches Brot schmeckt am Morgen besonders gut.~早晨的新鲜面包格外好吃。~形容词；冠词~grammis
A2~语法~komparativ-als~比较级加 als~比较两个不同程度时使用比较级和 als~Der Fußweg ist kürzer als die Busfahrt.~步行路线比公交行程短。~比较；交通~grammis
A2~语法~superlativ-am~am 加最高级~作表语或副词时常用 am …-sten~Im Frühling ist der Garten am schönsten.~春天花园最美。~比较；自然~grammis
A2~语法~zu-infinitiv-plan~zu 不定式补充计划~versuchen、planen、vergessen 等可带 zu 不定式~Wir planen, im Mai nach Leipzig zu fahren.~我们计划五月去莱比锡。~不定式；计划~grammis
A2~语法~um-zu-zweck~um … zu 表目的~两个分句主语相同时可用 um … zu~Sie steht früh auf, um den ersten Zug zu nehmen.~她早起是为了乘第一班火车。~目的；交通~grammis
A2~语法~ohne-zu-a2~ohne … zu 表未伴随行动~主语相同时用 ohne … zu 说明没有做另一件事~Er ging, ohne sich zu verabschieden.~他没有告别就走了。~方式；告别~grammis
A2~语法~reflexiv-akk-a2~第四格反身代词~主语与宾语指同一人时使用 mich、dich、sich 等~Nach der Reise erhole ich mich zu Hause.~旅行后我在家休息恢复。~反身；健康~grammis
A2~语法~verben-mit-dativ-akk~双宾语动词~geben、zeigen、schicken 常同时带第三格人物和第四格事物~Die Stadtführerin zeigt den Gästen einen alten Plan.~导游给客人看一张旧地图。~第三格；宾格~grammis
A2~语法~deshalb-hauptsatz~deshalb 连接结果~deshalb 占据第一位时，变位动词仍居第二位~Der Aufzug ist kaputt, deshalb nehmen wir die Treppe.~电梯坏了，所以我们走楼梯。~结果；词序~grammis
A2~语法~trotzdem-hauptsatz~trotzdem 表转折结果~trotzdem 引出与预期相反的主句~Es regnet, trotzdem gehen viele Menschen zum Markt.~虽然下雨，仍有很多人去市场。~让步；市场~grammis
B1~表达~meines-erachtens~Meines Erachtens …~依我之见……~Meines Erachtens sollte die Stadt mehr Bäume pflanzen.~依我看，这座城市应该种更多树。~观点；城市~goethe
B1~表达~bin-der-ansicht~Ich bin der Ansicht, dass …~我认为……~Ich bin der Ansicht, dass öffentliche Daten verständlich erklärt werden müssen.~我认为公共数据必须得到通俗解释。~观点；信息~goethe
B1~表达~kann-gut-nachvollziehen~Das kann ich gut nachvollziehen.~这一点我很能理解。~Ihre Sorge kann ich gut nachvollziehen.~我很能理解您的担忧。~共情；沟通~goethe
B1~表达~sehe-etwas-anders~Das sehe ich etwas anders.~我对此有不同看法。~Das sehe ich etwas anders, weil die Kosten nicht alles erklären.~我对此有不同看法，因为成本不能解释一切。~分歧；论证~goethe
B1~表达~stimme-teilweise-zu~Dem stimme ich nur teilweise zu.~我只部分赞同这一点。~Dem stimme ich nur teilweise zu; für kleine Orte gelten andere Bedingungen.~我只部分赞同；小地方的条件不同。~分歧；条件~goethe
B1~表达~dafuer-spricht~Dafür spricht, dass …~支持这一点的理由是……~Dafür spricht, dass die neue Strecke deutlich kürzer ist.~支持这一点的理由是新路线明显更短。~论证；交通~goethe
B1~表达~dagegen-spricht~Dagegen spricht, dass …~反对这一点的理由是……~Dagegen spricht, dass nachts keine Busse fahren.~反对这一点的理由是夜间没有公交车。~论证；时间~goethe
B1~表达~auf-der-einen-seite-b1~Auf der einen Seite …, auf der anderen Seite …~一方面……，另一方面……~Auf der einen Seite spart die App Zeit, auf der anderen Seite braucht sie persönliche Daten.~这个应用一方面节省时间，另一方面需要个人数据。~权衡；技术~goethe
B1~表达~haengt-davon-ab~Es hängt davon ab, ob …~这取决于是否……~Es hängt davon ab, ob das Wetter stabil bleibt.~这取决于天气是否保持稳定。~条件；天气~goethe
B1~表达~vorausgesetzt-dass~Vorausgesetzt, dass …~前提是……~Vorausgesetzt, dass alle zustimmen, beginnen wir am Montag.~前提是所有人都同意，我们星期一开始。~条件；协作~goethe
B1~表达~falls-noetig~Falls nötig, …~必要时……~Falls nötig, können wir die Sitzung online fortsetzen.~必要时我们可以在线继续会议。~应变；技术~goethe
B1~表达~auf-jeden-fall~Auf jeden Fall …~无论如何；肯定……~Auf jeden Fall sollten wir die Originalquelle lesen.~无论如何，我们都应该阅读原始来源。~强调；来源~goethe
B1~表达~im-notfall~Im Notfall …~在紧急情况下……~Im Notfall rufen Sie die örtliche Notrufnummer an.~紧急情况下请拨打当地急救电话。~紧急；行动~goethe
B1~表达~soweit-beurteilen~Soweit ich das beurteilen kann, …~据我所能判断……~Soweit ich das beurteilen kann, ist die Brücke wieder geöffnet.~据我所能判断，这座桥已经重新开放。~信息边界；城市~goethe
B1~表达~nach-meinem-wissen~Nach meinem jetzigen Wissen …~根据我目前掌握的信息……~Nach meinem jetzigen Wissen beginnt der Kurs erst im Oktober.~据我目前所知，课程十月才开始。~信息边界；学习~goethe
B1~表达~habe-erfahren~Ich habe erfahren, dass …~我得知……~Ich habe erfahren, dass das Archiv digitalisiert wird.~我得知这份档案正在数字化。~信息；档案~goethe
B1~表达~mir-aufgefallen~Mir ist aufgefallen, dass …~我注意到……~Mir ist aufgefallen, dass hier viele Menschen mit dem Rad fahren.~我注意到这里很多人骑自行车。~观察；城市~goethe
B1~表达~ueberrascht-mich~Mich überrascht, dass …~令我惊讶的是……~Mich überrascht, dass das Gebäude vollständig aus Holz besteht.~令我惊讶的是这栋建筑完全由木材建成。~感知；建筑~goethe
B1~表达~besonders-wichtig~Besonders wichtig ist, dass …~尤其重要的是……~Besonders wichtig ist, dass die Übersetzung den Sinn bewahrt.~尤其重要的是译文保留原意。~重点；语言~goethe
B1~表达~darauf-achten~Man sollte darauf achten, dass …~应该注意……~Man sollte darauf achten, dass die Tür wirklich geschlossen ist.~应该注意门是否真的关好了。~提醒；安全~goethe
B1~表达~waere-sinnvoll~Es wäre sinnvoll, …~……会比较合理。~Es wäre sinnvoll, vor der Reise eine Kopie des Passes zu speichern.~旅行前保存护照副本会比较合理。~建议；旅行~goethe
B1~表达~schlage-vor-b1~Ich schlage vor, dass …~我建议……~Ich schlage vor, dass wir zuerst die wichtigsten Aufgaben verteilen.~我建议我们先分配最重要的任务。~建议；协作~goethe
B1~表达~einigen-darauf~Können wir uns darauf einigen, dass …?~我们能否就……达成一致？~Können wir uns darauf einigen, dass jede Person zehn Minuten spricht?~我们能否约定每个人发言十分钟？~协商；时间~goethe
B1~表达~noch-einmal-zusammenfassen~Darf ich das noch einmal zusammenfassen?~我可以再总结一下吗？~Darf ich das Ergebnis noch einmal kurz zusammenfassen?~我可以再简要总结一下结果吗？~总结；沟通~goethe
B1~表达~wenn-richtig-verstanden~Wenn ich Sie richtig verstanden habe, …~如果我理解正确……~Wenn ich Sie richtig verstanden habe, bleibt der Plan unverändert.~如果我理解正确，计划保持不变。~核对；沟通~goethe
B1~词汇~die-quelle~die Quelle~来源；源头~Jede Zahl im Bericht braucht eine überprüfbare Quelle.~报告中的每个数字都需要可核查的来源。~来源；证据~duden
B1~词汇~der-beleg~der Beleg~证据；凭证~Für diese Behauptung fehlt noch ein überzeugender Beleg.~这一说法还缺少有说服力的证据。~证据；论证~duden
B1~词汇~die-behauptung~die Behauptung~主张；说法~Eine Behauptung wird nicht allein durch häufiges Wiederholen wahr.~一种说法不会因为反复出现就变成事实。~论证；批判思考~duden
B1~词汇~die-stichprobe~die Stichprobe~样本~Die Stichprobe umfasst Menschen aus fünf Regionen.~样本包含来自五个地区的人。~研究；数据~duden
B1~词汇~die-umfrage~die Umfrage~调查~Die Umfrage fragt nach den täglichen Verkehrswegen.~这项调查询问人们日常的交通路线。~研究；社会~duden
B1~词汇~die-auswertung~die Auswertung~分析；评估结果~Die Auswertung der Antworten dauert mehrere Tage.~分析这些回答需要几天。~数据；时间~duden
B1~词汇~der-durchschnitt~der Durchschnitt~平均数；平均水平~Der Durchschnitt verdeckt manchmal große Unterschiede.~平均数有时会掩盖巨大差异。~数据；比较~duden
B1~词汇~der-anteil~der Anteil~比例；份额~Der Anteil der Radfahrer ist im Sommer höher.~夏季骑车者的比例更高。~数据；交通~duden
B1~词汇~die-tendenz~die Tendenz~趋势；倾向~Die Zahlen zeigen eine langsame, aber stabile Tendenz.~数据呈现缓慢但稳定的趋势。~数据；时间~duden
B1~词汇~die-ursache~die Ursache~原因~Die genaue Ursache der Störung ist noch unbekannt.~故障的确切原因仍不清楚。~因果；技术~duden
B1~词汇~die-folge~die Folge~后果；结果~Eine längere Trockenheit hat Folgen für die Landwirtschaft.~长期干旱会对农业产生影响。~因果；环境~duden
B1~词汇~der-zusammenhang~ein statistischer Zusammenhang~统计关联~Ein Zusammenhang bedeutet nicht automatisch eine Ursache.~存在关联并不自动意味着因果关系。~研究；因果~duden
B1~词汇~die-einschaetzung~die Einschätzung~评估；判断~Die erste Einschätzung kann sich durch neue Daten ändern.~初步判断可能因新数据而改变。~判断；数据~duden
B1~词汇~die-rueckmeldung~die Rückmeldung~反馈~Ihre Rückmeldung hilft uns, die Anleitung zu verbessern.~您的反馈有助于我们改进说明。~沟通；改进~duden
B1~词汇~die-vereinbarung~die Vereinbarung~约定；协议~Die Vereinbarung gilt zunächst für sechs Monate.~这项约定暂定有效六个月。~协作；时间~duden
B1~词汇~die-frist~die Frist~截止期限~Die Frist für den Antrag endet am Monatsende.~申请截止到月底。~时间；行政~duden
B1~词汇~die-voraussetzung~eine wichtige Voraussetzung~一项重要前提~Gute Sprachkenntnisse sind eine wichtige Voraussetzung für den Kurs.~良好的语言能力是参加课程的重要前提。~条件；学习~duden
B1~词汇~die-ausnahme~die Ausnahme~例外~Für medizinische Notfälle gilt eine Ausnahme.~医疗紧急情况适用例外规定。~规则；紧急~duden
B1~词汇~die-zustaendigkeit~die Zuständigkeit~职责范围~Die Zuständigkeit liegt bei der örtlichen Behörde.~这属于当地主管部门的职责。~制度；行政~duden
B1~词汇~die-beteiligung~die Beteiligung~参与~Eine breite Beteiligung verbessert die Planung des Parks.~广泛参与能改善公园规划。~社区；规划~duden
B1~词汇~die-nachhaltigkeit~die Nachhaltigkeit~可持续性~Nachhaltigkeit betrifft Ressourcen, Kosten und soziale Folgen.~可持续性涉及资源、成本和社会影响。~环境；社会~duden
B1~词汇~der-verbrauch~der Verbrauch~消耗；消费量~Der Stromverbrauch sinkt durch eine bessere Dämmung.~改善保温能降低耗电量。~能源；建筑~duden
B1~词汇~die-versorgung~die Versorgung~供应；保障~Die Wasserversorgung muss auch bei Hitze funktionieren.~供水在高温时也必须正常运行。~公共服务；气候~duden
B1~词汇~die-erreichbarkeit~die Erreichbarkeit~可达性；联系便利度~Die Erreichbarkeit des Krankenhauses hat sich verbessert.~医院的可达性得到改善。~交通；健康~duden
B1~词汇~die-barrierefreiheit~die Barrierefreiheit~无障碍性~Barrierefreiheit nützt Menschen mit sehr unterschiedlichen Bedürfnissen.~无障碍环境能帮助需求各异的人。~公共空间；包容~duden
B1~语法~plusquamperfekt-vorzeitigkeit~过去完成时~hatte 或 war 加第二分词表示另一个过去事件之前已完成~Nachdem wir angekommen waren, begann der Regen.~我们到达后，雨开始下了。~过去；时间顺序~grammis
B1~语法~nachdem-vorzeitig~nachdem 时间从句~nachdem 明确一个行动先于主句行动~Nachdem sie die Quelle geprüft hatte, änderte sie den Text.~她核查来源后修改了文本。~时间；来源~grammis
B1~语法~bevor-nachzeitig~bevor 时间从句~bevor 引出发生在主句行动之后的事件~Speichern Sie die Datei, bevor Sie das Programm schließen.~关闭程序前请保存文件。~时间；技术~grammis
B1~语法~waehrend-gleichzeitig~während 表同时或对比~während 可表达两个行动同时发生，也可建立对照~Während ich den Bericht las, notierte meine Kollegin die Fragen.~我读报告时，同事记录问题。~同时；协作~grammis
B1~语法~seitdem-zeitpunkt~seitdem 表起点延续~从过去起持续到现在的情形可用 seitdem~Seitdem die Buslinie fährt, ist das Dorf besser erreichbar.~自从这条公交线路开通，村庄更易到达。~时间；交通~grammis
B1~语法~bis-zeitgrenze~bis 表时间终点~bis 从句标出主句状态持续的界限~Wir warten, bis alle Ergebnisse vorliegen.~我们等到全部结果出来。~时间；研究~grammis
B1~语法~obwohl-konzessiv-b1~obwohl 引导让步关系~从句承认一个事实，主句说明相反结果~Obwohl der Weg steil ist, nutzen ihn viele Einwohner täglich.~尽管道路陡峭，许多居民每天都走。~让步；城市~grammis
B1~语法~sodass-folge~sodass 表结果~sodass 从句说明前述情况导致的结果~Der Sturm war stark, sodass die Fähren im Hafen blieben.~风暴很强，因此渡轮留在港内。~结果；天气~grammis
B1~语法~damit-zweck-verschieden~damit 表不同主语的目的~两个行动主语不同时通常用 damit 从句~Die Stadt stellt Bänke auf, damit ältere Menschen sich ausruhen können.~城市设置长椅，让老年人能够休息。~目的；公共空间~grammis
B1~语法~je-desto-b1~je … desto 的比例关系~je 从句与 desto 主句表示两个程度共同变化~Je häufiger man übt, desto sicherer wird die Aussprache.~练习越频繁，发音就越稳定。~比较；学习~grammis
B1~语法~konjunktiv-zwei-rat~第二虚拟式提出建议~könnte、sollte 和 würde 可让建议更委婉~Du könntest die beiden Angebote zuerst vergleichen.~你可以先比较这两个方案。~虚拟式；建议~grammis
B1~语法~konjunktiv-zwei-wunsch~第二虚拟式表达非现实愿望~wäre、hätte 或 würde 表达与现实不同的愿望~Ich wäre jetzt gern am Meer.~我现在真想在海边。~虚拟式；愿望~grammis
B1~语法~passiv-praesens-prozess~现在时过程被动~werden 加第二分词突出过程或行动对象~Die historischen Fenster werden sorgfältig restauriert.~这些历史窗户正在得到精心修复。~被动；建筑~grammis
B1~语法~passiv-praeteritum~过去时过程被动~wurden 加第二分词叙述过去的被动过程~Die Brücke wurde nach dem Hochwasser repariert.~洪水后这座桥得到修复。~被动；重建~grammis
B1~语法~zustandspassiv-sein~状态被动~sein 加第二分词描述行动完成后的状态~Alle Türen sind bereits geschlossen.~所有门已经关好。~被动；状态~grammis
B1~语法~relativ-dativ-b1~关系代词 dem、der、denen~关系从句中的动词或介词决定 dem、der、denen~Die Nachbarin, der ich geholfen habe, spricht drei Sprachen.~我帮助过的邻居会说三种语言。~关系从句；人物~grammis
B1~语法~relativ-mit-praeposition~介词加关系代词~介词置于关系代词前并决定格~Das ist das Thema, über das wir gestern gesprochen haben.~这就是我们昨天讨论的主题。~关系从句；讨论~grammis
B1~语法~genitiv-s~专有名词所有格~人名通常直接加 -s 表所属，不用撇号~Kafkas Texte werden in vielen Sprachen gelesen.~卡夫卡的作品被译成多种语言阅读。~所有格；文学~grammis
B1~语法~wegen-genitiv-dativ~wegen 的格选择~正式标准语常接第二格，口语中也可听到第三格~Wegen des starken Nebels startete das Flugzeug später.~因为浓雾，飞机晚些起飞。~介词；天气~grammis
B1~语法~trotz-genitiv~trotz 表让步关系~trotz 通常与第二格名词组合~Trotz des hohen Preises war die Führung ausgebucht.~尽管价格高，导览仍被订满。~介词；让步~grammis
B1~语法~wegen-demonstrativ-da~da(r)复合词指事物~介词宾语为事物时常用 damit、darüber、davon 等~Wir sprechen morgen darüber.~我们明天讨论这件事。~代词；讨论~grammis
B1~语法~wo-compounds-colloquial~wo(r)复合词提问~womit、worüber、woran 等询问介词所指事物~Woran erkennen wir eine verlässliche Quelle?~我们凭什么判断一个来源可靠？~疑问；来源~grammis
B1~语法~nomen-verb-verbindung-b1~常用名词动词搭配~固定搭配如 eine Entscheidung treffen 需要整体记忆~Die Gemeinde trifft nächste Woche eine Entscheidung.~市政府下周作出决定。~搭配；决策~grammis
B1~语法~partizip-als-adjektiv~分词作形容词~第一分词偏进行含义，第二分词常表示完成或被动~Die restaurierte Fassade leuchtet wieder hell.~修复后的立面重新焕发光彩。~分词；建筑~grammis
B1~语法~lassen-veranlassen~lassen 表让别人做~lassen 加不定式可表示安排他人完成行动~Wir lassen die Heizung morgen prüfen.~我们安排明天检查暖气。~使役；家庭~grammis
B2~表达~es-ist-festzuhalten~Es ist festzuhalten, dass …~需要指出的是……~Es ist festzuhalten, dass beide Gruppen unter denselben Bedingungen getestet wurden.~需要指出的是，两组在相同条件下接受了测试。~学术表达；证据~goethe
B2~表达~daraus-folgt-nicht~Daraus folgt nicht zwangsläufig, dass …~这并不必然意味着……~Daraus folgt nicht zwangsläufig, dass die Maßnahme überall gleich wirkt.~这并不必然意味着该措施在各地效果相同。~推理；边界~goethe
B2~表达~laesst-sich-einwenden~Dagegen lässt sich einwenden, dass …~对此可以提出异议……~Dagegen lässt sich einwenden, dass wichtige Vergleichsdaten fehlen.~对此可以提出异议：缺少重要的比较数据。~反驳；数据~goethe
B2~表达~unter-der-annahme~Unter der Annahme, dass …~在假定……的前提下~Unter der Annahme, dass die Preise stabil bleiben, ist der Plan finanzierbar.~假定价格保持稳定，这项计划在财务上可行。~假设；规划~goethe
B2~表达~vor-dem-hintergrund~Vor dem Hintergrund …~鉴于……的背景~Vor dem Hintergrund der langen Trockenheit gelten strengere Wasserregeln.~鉴于长期干旱，目前实行更严格的用水规定。~背景；环境~goethe
B2~表达~in-anbetracht~In Anbetracht …~考虑到……~In Anbetracht der kurzen Frist sollten wir die Aufgaben klar priorisieren.~考虑到期限很短，我们应明确任务优先级。~权衡；时间~goethe
B2~表达~ungeachtet-dessen~Ungeachtet dessen …~尽管如此……~Die Finanzierung ist noch offen; ungeachtet dessen beginnt die Planung.~资金尚未落实；尽管如此，规划已经开始。~让步；规划~goethe
B2~表达~nicht-ausgeschlossen~Es ist nicht ausgeschlossen, dass …~不能排除……~Es ist nicht ausgeschlossen, dass weitere Faktoren das Ergebnis beeinflusst haben.~不能排除其他因素影响了结果。~不确定性；研究~goethe
B2~表达~spricht-wenig-dafuer~Es spricht wenig dafür, dass …~几乎没有理由认为……~Es spricht wenig dafür, dass ein einzelner Wert den gesamten Trend erklärt.~几乎没有理由认为单个数值能解释整体趋势。~证据；数据~goethe
B2~表达~bedarf-pruefung~Dies bedarf einer genaueren Prüfung.~这需要更仔细的核查。~Ob die Änderung tatsächlich hilft, bedarf einer genaueren Prüfung.~这项改变是否确实有帮助，需要更仔细核查。~核查；证据~goethe
B2~表达~differenziert-betrachten~Das muss differenziert betrachtet werden.~这需要分情况看待。~Die Wirkung des Tourismus muss regional differenziert betrachtet werden.~旅游业的影响需要按地区分别看待。~分析；旅游~goethe
B2~表达~nicht-gleichzusetzen~… ist nicht gleichzusetzen mit …~……不能等同于……~Eine hohe Bewertung ist nicht gleichzusetzen mit persönlicher Eignung.~高评分不能等同于适合每个人。~概念；评价~goethe
B2~表达~aus-schliessen~Aus … lässt sich schließen, dass …~从……可以推断……~Aus den Messreihen lässt sich schließen, dass der Verbrauch saisonal schwankt.~从测量序列可以推断，消耗量随季节波动。~推理；数据~goethe
B2~表达~steht-im-widerspruch~Das steht im Widerspruch zu …~这与……相矛盾~Die Aussage steht im Widerspruch zu den veröffentlichten Zahlen.~这一说法与公布的数据相矛盾。~矛盾；证据~goethe
B2~表达~deckt-sich-mit~Das deckt sich mit …~这与……相吻合~Diese Beobachtung deckt sich mit den Ergebnissen der zweiten Studie.~这一观察与第二项研究结果相吻合。~一致性；研究~goethe
B2~表达~knuepft-an~Daran knüpft die Frage an, ob …~由此引出一个问题：是否……~Daran knüpft die Frage an, ob kleinere Städte ähnlich profitieren.~由此引出一个问题：较小城市是否也有类似受益。~提问；城市~goethe
B2~表达~bleibt-offen~Offen bleibt, ob …~尚不清楚是否……~Offen bleibt, ob die Veränderung dauerhaft ist.~尚不清楚这种变化是否持久。~信息边界；时间~goethe
B2~表达~entscheidend-ist~Entscheidend ist weniger … als vielmehr …~关键不在于……而在于……~Entscheidend ist weniger die Menge als vielmehr die Qualität der Daten.~关键不在数据数量，而在数据质量。~重点；数据~goethe
B2~表达~je-nach-perspektive~Je nach Perspektive …~视角不同则……~Je nach Perspektive kann das Gebäude als Denkmal oder Belastung erscheinen.~视角不同，这座建筑可能被看作纪念物或负担。~视角；建筑~goethe
B2~表达~im-weiteren-sinne~Im weiteren Sinne …~从更广泛意义上说……~Im weiteren Sinne betrifft die Entscheidung die gesamte Region.~从更广泛意义上说，这项决定影响整个地区。~范围；决策~goethe
B2~表达~im-engeren-sinne~Im engeren Sinne …~严格来说；狭义上……~Im engeren Sinne bezeichnet der Begriff nur die historische Altstadt.~严格来说，这个词只指历史老城。~定义；历史~goethe
B2~表达~unterdessen-zeigt~Unterdessen zeigt sich, dass …~与此同时可以看出……~Unterdessen zeigt sich, dass die Nachfrage in ländlichen Gebieten wächst.~与此同时可以看出，农村地区的需求正在增长。~趋势；地区~goethe
B2~表达~vorlaeufiges-fazit~Als vorläufiges Fazit lässt sich sagen, dass …~作为初步结论可以说……~Als vorläufiges Fazit lässt sich sagen, dass weitere Beobachtungen nötig sind.~作为初步结论，可以说还需要更多观察。~总结；边界~goethe
B2~表达~im-kern-geht-es~Im Kern geht es darum, …~核心在于……~Im Kern geht es darum, Risiken verständlich zu kommunizieren.~核心在于以易懂方式沟通风险。~重点；风险~goethe
B2~表达~steht-zur-debatte~Zur Debatte steht, ob …~正在讨论的是是否……~Zur Debatte steht, ob das Gelände öffentlich zugänglich bleiben soll.~正在讨论的是该场地是否应继续向公众开放。~公共讨论；空间~goethe
B2~词汇~die-aussagekraft~die Aussagekraft~说明力；信息价值~Die Aussagekraft der Grafik hängt von der Datenauswahl ab.~图表的说明力取决于数据选择。~数据；评价~duden
B2~词汇~die-belastbarkeit~die Belastbarkeit~可靠程度；承受能力~Die Belastbarkeit der Schätzung ist wegen der kleinen Stichprobe begrenzt.~由于样本小，估计的可靠程度有限。~研究；边界~duden
B2~词汇~die-nachvollziehbarkeit~die Nachvollziehbarkeit~可追溯性；可理解性~Eine klare Dokumentation erhöht die Nachvollziehbarkeit des Verfahrens.~清晰记录能提高流程的可追溯性。~方法；记录~duden
B2~词汇~die-verzerrung~die Verzerrung~偏差；歪曲~Eine freiwillige Umfrage kann eine systematische Verzerrung enthalten.~自愿参加的调查可能包含系统性偏差。~研究；风险~duden
B2~词汇~die-uebertragbarkeit~die Übertragbarkeit~可推广性~Die Übertragbarkeit auf andere Länder ist noch nicht geklärt.~向其他国家推广的可行性尚未明确。~研究；地区~duden
B2~词汇~die-vergleichbarkeit~die Vergleichbarkeit~可比性~Unterschiedliche Messmethoden erschweren die Vergleichbarkeit.~不同测量方法会妨碍可比性。~比较；方法~duden
B2~词汇~die-gewichtung~die Gewichtung~权重设置；侧重~Die Gewichtung der Kriterien verändert die Rangfolge.~指标权重会改变排序。~决策；方法~duden
B2~词汇~die-priorisierung~die Priorisierung~优先排序~Eine transparente Priorisierung erleichtert schwierige Entscheidungen.~透明的优先排序有助于作出困难决定。~决策；透明~duden
B2~词汇~der-zielkonflikt~der Zielkonflikt~目标冲突~Zwischen günstigen Preisen und hohen Umweltstandards besteht ein Zielkonflikt.~低价格与高环境标准之间存在目标冲突。~权衡；环境~duden
B2~词汇~die-pflicht~die Rechenschaftspflicht~问责责任~Öffentliche Institutionen unterliegen einer besonderen Rechenschaftspflicht.~公共机构承担特殊的问责责任。~制度；公共~duden
B2~词汇~die-umsetzbarkeit~die Umsetzbarkeit~可实施性~Vor der Entscheidung prüfen wir Kosten und Umsetzbarkeit.~作决定前我们核查成本与可实施性。~规划；决策~duden
B2~词汇~die-wirksamkeit~die Wirksamkeit~有效性~Die Wirksamkeit einer Maßnahme muss am vereinbarten Ziel gemessen werden.~一项措施的有效性必须按约定目标衡量。~评价；目标~duden
B2~词汇~die-zweckmaessigkeit~die Zweckmäßigkeit~适切性；合目的性~Die Zweckmäßigkeit hängt vom konkreten Einsatzbereich ab.~是否适切取决于具体使用场景。~评价；场景~duden
B2~词汇~die-verhaeltnismaessigkeit~die Verhältnismäßigkeit~比例原则；适度性~Das Gericht prüft die Verhältnismäßigkeit des Eingriffs.~法院审查该干预是否符合比例原则。~法律；权衡~duden
B2~词汇~die-eigenverantwortung~die Eigenverantwortung~个人自主责任~Eigenverantwortung setzt verständliche Informationen und echte Wahlmöglichkeiten voraus.~个人自主责任以易懂信息和真实选择为前提。~伦理；信息~duden
B2~词汇~die-daseinsvorsorge~die Daseinsvorsorge~基本公共服务保障~Wasser und öffentlicher Verkehr gehören zur kommunalen Daseinsvorsorge.~供水和公共交通属于市政基本公共服务。~公共服务；城市~duden
B2~词汇~die-wechselbeziehung~die Wechselbeziehung~相互关系~Die Wechselbeziehung zwischen Wohnen und Verkehr prägt die Stadtentwicklung.~居住与交通的相互关系塑造城市发展。~城市；系统~duden
B2~词汇~die-pfadabhaengigkeit~die Pfadabhängigkeit~路径依赖~Historische Entscheidungen können durch Pfadabhängigkeit lange nachwirken.~历史决策可通过路径依赖产生长期影响。~历史；制度~duden
B2~词汇~der-handlungsspielraum~der Handlungsspielraum~行动空间~Klare Zuständigkeiten erweitern den Handlungsspielraum des Teams.~清晰职责能扩大团队的行动空间。~协作；制度~duden
B2~词汇~der-erkenntnisgewinn~der Erkenntnisgewinn~认识增益；新发现~Der Erkenntnisgewinn liegt in der Verbindung zweier Datenquellen.~新的认识来自两类数据源的结合。~研究；来源~duden
B2~词汇~die-annahme~die Annahme~假设；前提~Jedes Modell beruht auf vereinfachenden Annahmen.~每个模型都建立在简化假设之上。~模型；边界~duden
B2~词汇~die-randbedingung~die Randbedingung~边界条件~Unter anderen Randbedingungen kann das Ergebnis anders ausfallen.~边界条件不同，结果可能不同。~条件；结果~duden
B2~词汇~die-abwaertsspirale~die Abwärtsspirale~恶性循环~Leerstand und fehlende Angebote können eine Abwärtsspirale auslösen.~空置和服务缺失可能引发恶性循环。~城市；因果~duden
B2~词汇~die-resilienz~die Resilienz~韧性；恢复力~Vielfältige Versorgungswege erhöhen die Resilienz einer Region.~多样的供应途径能提高一个地区的韧性。~韧性；地区~duden
B2~词汇~die-teilhabe~die Teilhabe~参与和共享机会~Digitale Teilhabe erfordert Zugang, Fähigkeiten und barrierefreie Angebote.~数字参与需要接入条件、技能和无障碍服务。~包容；技术~duden
B2~语法~konjunktiv-eins-distanz~第一虚拟式保持转述距离~正式报道用第一虚拟式标记内容来自他人~Die Ministerin erklärte, das Verfahren sei transparent.~部长表示，该程序是透明的。~转述；媒体~grammis
B2~语法~konjunktiv-eins-ersatz~第一虚拟式的 würde 替代~当第一虚拟式与直陈式同形时可换用第二虚拟式形式~Die Forschenden sagten, sie würden die Daten veröffentlichen.~研究人员说他们会公布数据。~转述；研究~grammis
B2~语法~modalverb-subjektiv~情态动词的主观推测~sollen、wollen、dürften 等可标记传闻或概率~Das Gebäude soll im 18. Jahrhundert errichtet worden sein.~据说这栋建筑建于十八世纪。~推测；历史~grammis
B2~语法~passiv-mit-modalverb~情态动词加被动态~情态动词变位，被动不定式置于句末~Die Ergebnisse müssen unabhängig überprüft werden.~结果必须得到独立核查。~被动；核查~grammis
B2~语法~passiv-perfekt-b2~完成时被动态~ist 加第二分词和 worden 表示已完成的被动过程~Die Brücke ist mehrfach renoviert worden.~这座桥已经多次翻修。~被动；建筑~grammis
B2~语法~gerundiv-sein-zu~sein + zu + 不定式~该结构表达能够或必须完成，语义依语境判断~Die Datei ist nur mit einem Passwort zu öffnen.~这个文件只能用密码打开。~不定式；技术~grammis
B2~语法~haben-zu-verpflichtung~haben + zu + 不定式~正式语体中表示主体有义务做某事~Die Behörde hat den Antrag innerhalb eines Monats zu prüfen.~主管部门须在一个月内审核申请。~义务；行政~grammis
B2~语法~funktionsverb-in-betracht~功能动词结构 in Betracht ziehen~名词与轻动词形成正式表达，应整体理解~Wir ziehen auch eine kleinere Lösung in Betracht.~我们也考虑一个规模更小的方案。~搭配；决策~grammis
B2~语法~funktionsverb-zur-verfuegung~功能动词结构 zur Verfügung stehen~该搭配表示某资源可供使用~Für die Analyse stehen drei Datensätze zur Verfügung.~有三套数据可用于分析。~搭配；资源~grammis
B2~语法~nominalstil-verbalisieren~名词化改写为动词句~正式文本可通过动词化减少过密名词结构~Weil die Nachfrage sank, wurde das Angebot angepasst.~由于需求下降，供应得到调整。~写作；因果~grammis
B2~语法~erweiterte-partizipgruppe~扩展分词结构~分词及补语可压缩成名词前长定语~Die von unabhängigen Fachleuten geprüften Daten sind öffentlich.~经独立专家核查的数据已经公开。~书面语；数据~grammis
B2~语法~apposition-komma~同位语及逗号~补充说明名词的同位语通常用逗号隔开~Hannah Arendt, eine politische Theoretikerin, lebte lange im Exil.~政治理论家汉娜·阿伦特曾长期流亡。~标点；人物~grammis
B2~语法~korrelat-es-dass~先行词 es 与 dass 从句~某些谓语先用 es 占位，再由从句给出实际内容~Es ist bedauerlich, dass das Archiv geschlossen bleibt.~档案馆继续关闭令人遗憾。~句法；文化~grammis
B2~语法~indem-mittel-b2~indem 说明机制~indem 从句特别适合解释某结果如何实现~Die Plattform schützt Daten, indem sie nur notwendige Angaben speichert.~平台通过仅保存必要信息来保护数据。~机制；隐私~grammis
B2~语法~dadurch-dass~dadurch, dass 强调手段~主句代词 dadurch 与 dass 从句共同突出因果机制~Die Wartezeit sank dadurch, dass Termine online vergeben wurden.~通过在线分配预约，等待时间缩短了。~机制；技术~grammis
B2~语法~ohne-dass-b2~ohne dass 表不同主语~主从句主语不同或需完整从句时使用 ohne dass~Die Preise stiegen, ohne dass sich die Qualität verbesserte.~价格上涨了，质量却没有提高。~让步；评价~grammis
B2~语法~anstatt-dass~anstatt dass 表替代~从句说明本应或可能发生的替代行动~Anstatt dass man nur Symptome behandelt, sollte man die Ursache prüfen.~不应只处理表面症状，而应核查原因。~替代；因果~grammis
B2~语法~geschweige-denn~geschweige denn 递进否定~在否定陈述后引出更不可能成立的内容~Die Daten reichen nicht für einen Trend, geschweige denn für eine Prognose.~这些数据不足以判断趋势，更别说预测。~递进；数据~grammis
B2~语法~sowohl-als-auch~sowohl … als auch 并列~成对连接词强调两个成分同等成立~Die Entscheidung betrifft sowohl die Kosten als auch die Sicherheit.~这项决定既涉及成本，也涉及安全。~并列；权衡~grammis
B2~语法~weder-noch~weder … noch 双重否定~成对结构否定两个同类成分~Die Quelle nennt weder die Methode noch den Zeitraum.~来源既没有说明方法，也没有说明时间范围。~否定；来源~grammis
B2~语法~nicht-nur-sondern~nicht nur … sondern auch~先否定范围过窄，再补充第二个同类成分~Das Projekt spart nicht nur Energie, sondern verbessert auch den Komfort.~项目不仅节能，也改善舒适度。~递进；建筑~grammis
B2~语法~zumal-begruendung~zumal 补充强理由~zumal 引出的从句给出使主句更成立的附加理由~Wir verschieben die Reise, zumal schwere Stürme angekündigt sind.~我们推迟旅行，尤其因为预报有强风暴。~原因；天气~grammis
B2~语法~insofern-als~insofern … als 限定相关性~该结构说明判断只在哪个方面成立~Die Änderung ist insofern sinnvoll, als sie den Zugang erleichtert.~这项改变的合理之处在于它改善了可达性。~限定；公共空间~grammis
B2~语法~als-ob-irreal~als ob 非现实比较~从句常用第二虚拟式表达与事实不符的印象~Er spricht, als ob die Entscheidung bereits gefallen wäre.~他说得好像决定已经作出。~虚拟式；感知~grammis
B2~语法~waere-haette-vergangenheit~过去非现实条件~hätte 或 wäre 加第二分词表示未实现的过去条件~Wenn wir früher gestartet wären, hätten wir den Zug erreicht.~如果早点出发，我们本可以赶上火车。~虚拟式；过去~grammis
`, GERMAN_FIELDS, "German");

const MEDICAL_SOURCES = Object.freeze({
  whoActivity: ["世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/physical-activity"],
  nhlbiSleep: ["美国国家心肺血液研究所（NHLBI）", "https://www.nhlbi.nih.gov/health/sleep"],
  whoDiet: ["世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/healthy-diet"],
  niddkDigestive: ["美国国家糖尿病、消化和肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/digestive-diseases"],
  cdcHeart: ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/heart-disease/about/index.html"],
  niddkKidney: ["美国国家糖尿病、消化和肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/kidney-disease"],
  cdcInfection: ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/hygiene/about/index.html"],
  cdcVaccines: ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/vaccines-adults/recommended-vaccines/index.html"],
  nimhMental: ["美国国家精神卫生研究所（NIMH）", "https://www.nimh.nih.gov/health/topics/caring-for-your-mental-health"],
  niaBrain: ["美国国家老龄研究所（NIA）", "https://www.nia.nih.gov/health/brain-health/cognitive-health-and-older-adults"],
  neiEye: ["美国国家眼科研究所（NEI）", "https://www.nei.nih.gov/learn-about-eye-health/healthy-vision"],
  cdcHearing: ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/niosh/noise/about/noise.html"],
  fdaMedicine: ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/information-consumers-and-patients-drugs/think-it-through-managing-benefits-and-risks-medicines"],
  ahrqQuestions: ["美国医疗保健研究与质量局（AHRQ）", "https://www.ahrq.gov/questions/index.html"],
  nhsFirstAid: ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/"],
  cdcTravel: ["美国疾病控制与预防中心（CDC）", "https://wwwnc.cdc.gov/travel/destinations/list"],
  cdcEnvironment: ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/nceh/about/index.html"],
  nciPrevention: ["美国国家癌症研究所（NCI）", "https://www.cancer.gov/about-cancer/causes-prevention"],
  uspstf: ["美国预防服务工作组（USPSTF）", "https://www.uspreventiveservicestaskforce.org/uspstf/recommendation-topics/uspstf-a-and-b-recommendations"],
  whoLifespan: ["世界卫生组织（WHO）", "https://www.who.int/health-topics/life-course"],
  niaOlder: ["美国国家老龄研究所（NIA）", "https://www.nia.nih.gov/health/what-do-we-know-about-healthy-aging"],
  medline: ["美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/healthtopics.html"]
});

const MEDICAL_SOURCE_OVERRIDES = Object.freeze({
  "warm-up-specific": ["英国国民医疗服务体系（NHS）", "https://www.nhs.uk/live-well/exercise/how-to-warm-up-before-exercising/"],
  "bp-cuff-size": ["美国疾病控制与预防中心（CDC）", "https://stacks.cdc.gov/view/cdc/251870/cdc_251870_DS1.pdf"],
  "immunosuppressed-plan": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/respiratory-viruses/risk-factors/index.html"],
  "risk-absolute": ["美国国家癌症研究所（NCI）", "https://www.cancer.gov/about-cancer/screening/patient-screening-overview-pdq"],
  "reference-range": ["美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/"],
  "false-positive": ["美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/"],
  "health-app-privacy": ["美国卫生与公众服务部（HHS）", "https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/cell-phone-hipaa/index.html"],
  "folic-acid": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/folic-acid/about/index.html"],
  "pain-monitoring": ["美国国家糖尿病、消化和肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/weight-management/staying-active-at-any-size"],
  "probiotic-strain": ["美国国立卫生研究院补充与综合健康中心（NCCIH）", "https://www.nccih.nih.gov/health/probiotics-usefulness-and-safety"],
  "b12-plant-diet": ["美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/ency/article/002403.htm"],
  "reflux-pattern": ["美国国家糖尿病、消化和肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/digestive-diseases/acid-reflux-ger-gerd-adults/eating-diet-nutrition"],
  "egfr-trend": ["美国国家糖尿病、消化和肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/professionals/clinical-tools-patient-management/kidney-disease/laboratory-evaluation/estimated-gfr-calculators/adults-pediatrics"],
  "kidney-stone-fluid": ["美国国家糖尿病、消化和肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/urologic-diseases/kidney-stones/eating-diet-nutrition"],
  "foodborne-clusters": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/foodborne-outbreaks/what-to-do/index.html"],
  "skin-self-check": ["美国国家癌症研究所（NCI）", "https://www.cancer.gov/types/skin/moles-fact-sheet"],
  "prenatal-continuity": ["世界卫生组织（WHO）", "https://www.who.int/activities/promoting-healthy-pregnancy/promoting-healthy-pregnancy"],
  "sti-window": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/sti/testing/index.html"],
  "polypharmacy-goals": ["美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/ency/patientinstructions/000883.htm"],
  "caregiver-strain": ["美国国家老龄研究所（NIA）", "https://www.nia.nih.gov/health/caregiving/taking-care-yourself-tips-caregivers"],
  "advance-care-planning": ["美国国家老龄研究所（NIA）", "https://www.nia.nih.gov/health/advance-care-planning/advance-care-planning-advance-directives-health-care"],
  "twenty-rule": ["美国国家眼科研究所（NEI）", "https://www.nei.nih.gov/eye-health-information/healthy-vision/how-eyes-work/keep-your-eyes-healthy"],
  "hiv-pep-time": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/hiv/prevention/pep.html"],
  "psychosis-early": ["美国国家精神卫生研究所（NIMH）", "https://www.nimh.nih.gov/health/publications/understanding-psychosis"],
  "suicide-direct-question": ["美国国家精神卫生研究所（NIMH）", "https://www.nimh.nih.gov/health/publications/suicide-faq"],
  "sudden-vision-loss": ["美国国家眼科研究所（NEI）", "https://www.nei.nih.gov/eye-health-information/eye-conditions-and-diseases/retinal-detachment"],
  "flashes-floaters": ["美国国家眼科研究所（NEI）", "https://www.nei.nih.gov/eye-health-information/eye-conditions-and-diseases/floaters"],
  "pregnancy-warning": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/hearher/maternal-warning-signs/index.html"],
  "newborn-fever": ["英国国民医疗服务体系（NHS）", "https://www.nhs.uk/baby/health/when-to-get-urgent-medical-help-for-babies-and-children-under-5/"],
  "sleep-medicine-review": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/consumers/consumer-updates/taking-z-drugs-insomnia-know-risks"],
  "omega-three-food": ["美国国立卫生研究院膳食补充剂办公室（NIH ODS）", "https://ods.od.nih.gov/factsheets/Omega3FattyAcids-Consumer/"],
  "supplement-gap": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/food/information-consumers-using-dietary-supplements/questions-and-answers-dietary-supplements"],
  "nsaid-kidney": ["美国国家糖尿病、消化和肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/kidney-disease/keeping-kidneys-safe"],
  "active-ingredient": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/resources-drugs/drug-interactions-what-you-should-know"],
  "single-med-list": ["美国国家老龄研究所（NIA）", "https://www.nia.nih.gov/health/medicines-and-medication-management/taking-medicines-safely-you-age"],
  "adherence-barriers": ["美国国家老龄研究所（NIA）", "https://www.nia.nih.gov/health/medicines-and-medication-management/taking-medicines-safely-you-age"],
  "pill-organizer-limits": ["美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/ency/patientinstructions/000600.htm"],
  "food-interaction": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/resources-drugs/drug-interactions-what-you-should-know"],
  "grapefruit": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/consumers/consumer-updates/grapefruit-juice-and-some-drugs-dont-mix"],
  "otc-overlap": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/safe-use-over-counter-pain-relievers-and-fever-reducers/best-way-take-your-over-counter-pain-reliever-seriously-four-panel-brochure"],
  "nsaid-risk": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/safe-use-over-counter-pain-relievers-and-fever-reducers/best-way-take-your-over-counter-pain-reliever-seriously-four-panel-brochure"],
  "acetaminophen-total": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/safe-use-over-counter-pain-relievers-and-fever-reducers/acetaminophen"],
  "antibiotic-duration": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/antibiotic-use/about/index.html"],
  "expired-medicine": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/safe-disposal-medicines/dont-be-tempted-use-expired-medicines"],
  "safe-disposal": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/drugs/safe-disposal-medicines/disposal-unused-medicines-what-you-should-know"],
  "supplement-quality": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/food/information-consumers-using-dietary-supplements/questions-and-answers-dietary-supplements"],
  "pregnancy-medication": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/medicine-and-pregnancy/index.html"],
  "kidney-dose": ["美国国家糖尿病、消化和肾脏疾病研究所（NIDDK）", "https://www.niddk.nih.gov/health-information/kidney-disease/keeping-kidneys-safe"],
  "allergy-vs-side-effect": ["美国国家医学图书馆 MedlinePlus", "https://medlineplus.gov/ency/article/000819.htm"],
  "contrast-agent": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/radiation-emitting-products/medical-imaging/medical-x-ray-imaging"],
  "radiation-benefit": ["美国食品药品监督管理局（FDA）", "https://www.fda.gov/radiation-emitting-products/medical-imaging/medical-x-ray-imaging"],

  "travel-vaccine-leadtime": ["美国疾病控制与预防中心（CDC）", "https://wwwnc.cdc.gov/travel/page/travel-vaccines"],
  "mosquito-day-night": ["美国疾病控制与预防中心《黄皮书》", "https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/mosquitoes-ticks-and-other-arthropods.html"],
  "tick-removal": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/ticks/after-a-tick-bite/index.html"],
  "rabies-exposure": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/rabies/hcp/clinical-care/post-exposure-prophylaxis.html"],
  "altitude-ascent": ["美国疾病控制与预防中心《黄皮书》", "https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/high-altitude-travel-and-altitude-illness.html"],
  "sun-reflection": ["美国疾病控制与预防中心《黄皮书》", "https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/sun-exposure-in-travelers.html"],
  "travel-hydration": ["美国疾病控制与预防中心《黄皮书》", "https://www.cdc.gov/yellow-book/hcp/travelers-with-additional-considerations/travelers-with-chronic-illnesses.html"],
  "repellent-label": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/mosquitoes/prevention/index.html"],
  "traveler-diarrhea": ["美国疾病控制与预防中心《黄皮书》", "https://www.cdc.gov/yellow-book/hcp/preparing-international-travelers/travelers-diarrhea.html"],
  "safe-water": ["美国疾病控制与预防中心《黄皮书》", "https://www.cdc.gov/yellow-book/hcp/preparing-international-travelers/food-and-water-precautions-for-travelers.html"],
  "medication-travel": ["美国疾病控制与预防中心《黄皮书》", "https://www.cdc.gov/yellow-book/hcp/travelers-with-additional-considerations/traveling-with-prohibited-or-restricted-medications.html"],
  "insurance-evacuation": ["美国疾病控制与预防中心《黄皮书》", "https://www.cdc.gov/yellow-book/hcp/health-care-abroad/travel-insurance.html"],
  "flight-mobility": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/blood-clots/risk-factors/travel.html"],
  "motion-sickness": ["美国疾病控制与预防中心《黄皮书》", "https://www.cdc.gov/yellow-book/hcp/travel-air-sea/motion-sickness.html"],
  "travel-source-time": ["美国疾病控制与预防中心（CDC）", "https://wwwnc.cdc.gov/travel/destinations/list"],

  "aqi-activity": ["美国环保署 AirNow", "https://www.airnow.gov/aqi/aqi-basics/using-air-quality-index/"],
  "heat-plan": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/extreme-heat/about/index.html"],
  "cold-wind": ["美国疾病控制与预防中心《黄皮书》", "https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/heat-and-cold-illness-in-travelers.html"],
  "work-variation": ["美国国家职业安全卫生研究所（NIOSH）", "https://www.cdc.gov/niosh/ergonomics/ergo-programs/implement.html"],
  "shift-fatigue": ["美国国家职业安全卫生研究所（NIOSH）", "https://www.cdc.gov/niosh/bulletin/2020/fatigue-crisis.html"],
  "chemical-sds": ["美国职业安全与健康管理局（OSHA）", "https://www.osha.gov/sites/default/files/publications/OSHA3514.pdf"],
  "respirator-fit": ["美国国家职业安全卫生研究所（NIOSH）", "https://www.cdc.gov/niosh/ppe/respirators/fit-testing.html"],
  "indoor-co": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/carbon-monoxide/about/index.html"],
  "mold-moisture": ["美国环境保护署（EPA）", "https://www.epa.gov/mold/brief-guide-mold-moisture-and-your-home"],
  "radon-test": ["美国环境保护署（EPA）", "https://www.epa.gov/radon"],
  "wildfire-smoke": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/wildfires/safety/how-to-safely-stay-safe-during-a-wildfire.html"],
  "disaster-kit": ["美国联邦紧急事务管理署 Ready.gov", "https://www.ready.gov/"],
  "climate-distress": ["世界卫生组织（WHO）", "https://www.who.int/news/item/03-06-2022-why-mental-health-is-a-priority-for-action-on-climate-change"],

  "burn-cool-water": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/burns-and-scalds/"],
  "stroke-last-known-well": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/stroke/"],
  "heart-attack-varied": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/heart-attack/"],
  "cardiac-arrest-aed": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/cardiac-arrest/"],
  "adult-choking": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/choking/"],
  "anaphylaxis-epinephrine": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/anaphylaxis/"],
  "severe-asthma": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/asthma-attack/"],
  "sepsis-deterioration": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/sepsis/"],
  "massive-bleeding-pressure": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/life-threatening-bleed/"],
  "major-burn": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/severe-burn/"],
  "poison-exposure": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/poisoning/"],
  "carbon-monoxide": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/carbon-monoxide-poisoning/"],
  "heat-stroke": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/heatstroke/"],
  "hypothermia-gentle": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/hypothermia/"],
  "drowning-aftercare": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/drowning/"],
  "head-injury-observe": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/head-injury/"],
  "spinal-precaution": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/spinal-injury/"],
  "seizure-first-aid": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/seizure/"],
  "severe-hypoglycemia": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/diabetes/treatment/treatment-low-blood-sugar-hypoglycemia.html"],
  "chemical-eye": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/eye-injury/"],
  "opioid-overdose": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/stop-overdose/caring/naloxone.html"],
  "sepsis-recognition": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/sepsis/about/index.html"],
  "suicide-immediate": ["美国国家精神卫生研究所（NIMH）", "https://www.nimh.nih.gov/health/publications/suicide-faq"],
  "delirium-acute": ["英国国民医疗服务体系（NHS）", "https://www.nhs.uk/symptoms/confusion/"],
  "social-connection-quality": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/social-connectedness/about/"],
  "mania-warning": ["美国国家精神卫生研究所（NIMH）", "https://www.nimh.nih.gov/health/publications/bipolar-disorder"],
  "gambling-chasing": ["世界卫生组织（WHO）", "https://www.who.int/news-room/fact-sheets/detail/gambling"],
  "insect-bite": ["St John Ambulance", "https://www.sja.org.uk/first-aid-advice/insect-bites-and-stings/"],
  "antibiotic-resistance-action": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/antimicrobial-resistance/about/index.html"],
  "barrier-methods": ["美国疾病控制与预防中心（CDC）", "https://www.cdc.gov/condom-use/index.html"],
  "postpartum-mental": ["美国国家精神卫生研究所（NIMH）", "https://www.nimh.nih.gov/health/publications/perinatal-depression"],
  "ectopic-pregnancy": ["英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/ectopic-pregnancy/symptoms/"],
  "postpartum-hemorrhage": ["英国国民医疗服务体系（NHS）", "https://www.nhs.uk/pregnancy/labour-and-birth/early-days/"],
  "child-breathing": ["英国国民医疗服务体系（NHS）", "https://www.nhs.uk/baby/health/when-to-get-urgent-medical-help-for-babies-and-children-under-5/"],
  "tooth-avulsion": ["英国国民医疗服务体系（NHS）", "https://www.nhs.uk/conditions/knocked-out-tooth/"]
});

const MEDICAL_SOURCE_ACCESSED_AT_OVERRIDES = Object.freeze(Object.fromEntries([
  "pain-monitoring", "probiotic-strain", "b12-plant-diet", "reflux-pattern", "egfr-trend",
  "kidney-stone-fluid", "foodborne-clusters", "skin-self-check", "prenatal-continuity", "sti-window",
  "polypharmacy-goals", "caregiver-strain", "social-connection-quality", "mania-warning", "gambling-chasing",
  "burn-cool-water", "insect-bite", "antibiotic-resistance-action", "barrier-methods", "climate-distress",
  "postpartum-mental", "sepsis-recognition", "cardiac-arrest-aed", "adult-choking", "major-burn",
  "heat-stroke", "severe-hypoglycemia", "opioid-overdose", "suicide-immediate", "tooth-avulsion",
  "delirium-acute", "head-injury-observe"
].map((slug) => [slug, "2026-08-30"])));

const MEDICAL_FIELDS = Object.freeze([
  "groupKey", "slug", "topic", "title", "fact", "actionFocus", "redFlagFocus", "sourceKey", "riskLevel", "themeTags"
]);

// The source rows below preserve the first editorial pass.  These explicit
// overrides record the second-pass clinical triage so a broad red-flag list is
// not mistaken for an instruction to call an ambulance in every situation.
const MEDICAL_RISK_OVERRIDES = Object.freeze(Object.fromEntries([
  ...[
    "swimming-buddy", "allergy-intolerance", "fever-signal", "alcohol-standard",
    "trauma-control", "glaucoma-silent", "heat-plan", "flight-mobility",
    "shift-fatigue", "chemical-sds", "indoor-co", "wildfire-smoke",
    "infant-safe-sleep"
  ].map((slug) => [slug, "general"]),
  ...[
    "fracture-clues", "snoring-apnea", "parasomnia-safety", "drowsy-driving",
    "irregular-pulse", "hypoglycemia-rule", "edema-pattern", "kidney-stone-fluid",
    "foodborne-clusters", "tetanus-wound", "conjunctivitis-hygiene",
    "immunosuppressed-plan", "panic-wave", "depression-function", "mania-warning",
    "substance-coping", "gambling-chasing", "vertigo-pattern", "burn-cool-water",
    "insect-bite", "otc-overlap", "nsaid-risk", "acetaminophen-total",
    "allergy-vs-side-effect", "contrast-agent", "head-injury-observe",
    "altitude-ascent", "child-fever-comfort", "menopause-bleeding",
    "postpartum-mental"
  ].map((slug) => [slug, "caution"])
]));

const MEDICAL_SERVICE_URGENT_SLUGS = Object.freeze([
  "rabies-exposure", "hiv-pep-time", "psychosis-early", "suicide-direct-question",
  "sudden-vision-loss", "flashes-floaters", "poison-exposure", "seizure-first-aid",
  "chemical-eye", "tooth-avulsion", "pregnancy-warning", "newborn-fever"
]);

// Service-path urgent entries deliberately point to the appropriate specialty
// or poison/crisis service.  Ambulance language is reserved for a concrete
// red-flag condition rather than appended to the whole category.
const MEDICAL_CONTENT_OVERRIDES = Object.freeze({
  "warm-up-specific": Object.freeze({
    title: "运动前先用低强度动作逐步热身",
    fact: "热身可以从缓和动作开始，再逐步接近计划中的运动强度；具体动作应与当天项目和个人能力相配",
    actionFocus: "先完成低强度行进和关节活动，确认没有不适后再进入较剧烈运动"
  }),
  "bp-cuff-size": Object.freeze({
    title: "合适的袖带尺寸是准确测量血压的一部分",
    fact: "袖带应按上臂围选择；测量时还要让背部和手臂得到支撑、双脚落地并避免交谈",
    actionFocus: "核对设备说明中的上臂围范围，在相似条件下记录读数并让医疗团队复核设备与方法"
  }),
  "immunosuppressed-plan": Object.freeze({
    title: "免疫功能较弱者应预先确认感染预防和就医路径",
    fact: "免疫功能较弱会降低身体抵抗感染的能力，也可能增加某些呼吸道感染发展为重症的风险",
    actionFocus: "与照护团队核对适合自己的疫苗、暴露预防以及出现感染症状后如何尽快联系医疗服务"
  }),
  "risk-absolute": Object.freeze({
    title: "绝对风险与相对风险回答不同的问题",
    fact: "绝对风险描述特定人群在一定时间内发生事件的概率，相对风险则比较有无某项特征或暴露的两组人",
    actionFocus: "阅读风险数字时同时询问比较人群、时间范围、绝对事件数和相对变化"
  }),
  "reference-range": Object.freeze({
    title: "参考区间不是健康与疾病的绝对分界线",
    fact: "参考区间来自健康参考人群，不同实验室的方法和人群可使区间不同；区间内外结果都要结合症状与其他资料解释",
    actionFocus: "使用报告自身列出的单位和参考区间，并把结果交给医疗人员结合病史、检查和趋势解释"
  }),
  "false-positive": Object.freeze({
    title: "阳性检测结果有时仍需确认",
    fact: "没有检测完美无误；假阳性是检测提示存在某种情况、实际却不存在，部分结果需要另一项检测确认",
    actionFocus: "先核对检测目的、误差可能和确认路径，再依据完整评估决定下一步"
  }),
  "health-app-privacy": Object.freeze({
    title: "个人健康应用的数据不一定受医院病历同等规则保护",
    fact: "美国HHS指出，个人自行下载或输入到普通应用中的健康信息通常不适用HIPAA规则，除非应用由受监管机构或其合作方提供",
    actionFocus: "输入敏感健康信息前核对应用提供者、权限、分享对象和删除机制，并关闭非必要权限"
  }),
  "folic-acid": Object.freeze({
    title: "叶酸在受孕前和妊娠早期尤其重要",
    fact: "叶酸帮助预防部分胎儿脑和脊柱神经管缺陷，而神经管在妊娠早期形成",
    actionFocus: "可能怀孕者按当地建议核对日常叶酸来源；既往高风险妊娠者在备孕前向专业人员确认剂量"
  }),
  "caregiver-strain": Object.freeze({
    title: "长期照护者也需要把自己的健康列入计划",
    fact: "持续照护可能伴疲惫、焦虑、睡眠和身体问题；尽早识别压力信号并寻求支持比等到完全耗竭更可行",
    actionFocus: "列出可委托的具体任务，安排替代照护或短暂休息，并向医生说明自己承担照护工作",
    redFlagFocus: "若出现暴力、自伤、走失或已无法维持基本照护，先确保双方安全并立即联系当地急救或社会照护服务；其他持续耗竭应尽快寻求专业支持"
  }),
  "advance-care-planning": Object.freeze({
    title: "预先照护计划是在还能表达时讨论未来医疗选择",
    fact: "预先照护计划包括与亲友讨论价值和治疗偏好，也可通过预先指示指定在自己无法表达时作决定的代理人",
    actionFocus: "选择可信代理人，与家人和医疗人员讨论偏好，并把最新文件副本交给相关人员保存"
  }),
  "twenty-rule": Object.freeze({
    title: "二十—二十—二十规则可作为屏幕休息提醒",
    fact: "美国国家眼科研究所建议长时间看屏幕时，每二十分钟看约二十英尺外至少二十秒，让眼睛短暂休息",
    actionFocus: "把规律远眺、主动眨眼和合适的屏幕距离加入工作节奏；持续不适时安排眼科评估"
  }),
  "adherence-barriers": Object.freeze({
    title: "清楚的用药清单和固定流程可减少服药混乱",
    fact: "同一份清单应记录每种药的名称、用途、剂量和时间，并在复诊时与开药者核对",
    actionFocus: "把最新清单带到每次就医，若服法难以执行或出现副作用，先联系开药者共同调整"
  }),
  "travel-hydration": Object.freeze({
    title: "慢性病旅行补液应结合个人照护计划",
    fact: "心脏、肾脏等慢性病以及相关药物会影响旅行中的补液、活动和监测安排，不能套用统一饮水量",
    actionFocus: "出发前向照护团队确认补液和用药计划，途中按个人方案观察症状、尿量和异常水肿"
  }),
  "contrast-agent": Object.freeze({
    title: "部分X线检查使用静脉对比剂，也可能发生相关反应",
    fact: "对比剂可帮助某些X线检查显示组织；是否使用取决于检查目的，注射后也可能发生不良反应",
    actionFocus: "检查前说明既往对比剂反应、现有疾病和用药，并向影像团队询问本次检查的收益与风险",
    redFlagFocus: "若注射后出现呼吸困难、面舌肿胀、晕厥或严重皮疹，应立即联系急救"
  }),
  "rabies-exposure": Object.freeze({
    actionFocus: "若发生疑似哺乳动物咬抓伤或唾液接触黏膜，立即用大量肥皂水冲洗，并尽快联系狂犬病暴露处置、公卫或急诊服务评估暴露后预防",
    redFlagFocus: "若伤口严重出血、位于头颈或伤者出现意识与呼吸异常，应同时联系当地急救"
  }),
  "hiv-pep-time": Object.freeze({
    actionFocus: "若可能发生HIV暴露，尽快联系急诊、感染科或性健康服务评估暴露后预防",
    redFlagFocus: "若同时有严重出血、意识或呼吸异常，应联系当地急救；不要因羞耻或等待对方结果错过评估时限"
  }),
  "psychosis-early": Object.freeze({
    actionFocus: "若出现现实感改变或功能快速下降，平静陪伴并尽快联系精神健康服务评估",
    redFlagFocus: "若有伤害自己或他人的风险、无法照顾基本需要、严重激越或意识改变，应联系当地急救或危机服务"
  }),
  "suicide-direct-question": Object.freeze({
    actionFocus: "若当事人已有具体计划、可及手段或正在行动，陪伴并移开可安全移除的手段，立即联系危机或急救服务",
    redFlagFocus: "若无法保证短期安全、已经服药或发生自伤出血，不要让当事人独处或只依赖口头保证"
  }),
  "sudden-vision-loss": Object.freeze({
    actionFocus: "若突然视力下降或黑幕样遮挡，记录最后正常时间并立即联系急诊眼科；若同时脸歪、肢体无力或言语异常，应呼叫当地急救",
    redFlagFocus: "若伴剧烈头痛、神经症状、眼外伤或化学暴露，不要自行驾车或等待视力恢复"
  }),
  "flashes-floaters": Object.freeze({
    actionFocus: "若新出现闪光、飞蚊突然增多或视野缺损，分别遮眼确认受影响侧并在当天联系眼科完成散瞳眼底检查",
    redFlagFocus: "若出现黑幕样遮挡或突然视力下降，应立即联系急诊眼科"
  }),
  "poison-exposure": Object.freeze({
    actionFocus: "若发生疑似中毒且人仍清醒稳定，先移离持续暴露、保留包装并立即联系当地毒物中心获取针对性指引",
    redFlagFocus: "若出现意识下降、抽搐、呼吸困难或腐蚀品严重接触，应联系当地急救；不要自行催吐或给昏迷者进食饮水"
  }),
  "seizure-first-aid": Object.freeze({
    actionFocus: "当抽搐发作时移开危险物、保护头部并计时，停止后在呼吸正常且安全时侧卧",
    redFlagFocus: "若首次发作、持续超过五分钟、连续发作、发生于孕期或水中、受伤或呼吸未恢复，应联系当地急救"
  }),
  "chemical-eye": Object.freeze({
    actionFocus: "若眼部接触化学品，立即取下可轻易移除的隐形眼镜并用清水持续冲洗，同时联系毒物中心或急诊眼科",
    redFlagFocus: "若接触强酸碱、持续疼痛、视力变化或角膜浑浊，应立即接受急诊眼科评估；不要等待寻找中和剂"
  }),
  "tooth-avulsion": Object.freeze({
    actionFocus: "若恒牙因外伤完全脱落，只拿牙冠；如脏，用牛奶、生理盐水或唾液轻柔冲洗，仅在能轻松放回时尝试复位，否则置于牛奶或唾液中，并立即联系急诊牙科",
    completeAction: true,
    redFlagFocus: "若出现大量出血、颌骨损伤、意识异常或疑似吸入牙齿，应联系当地急救；乳牙不要复位"
  }),
  "pregnancy-warning": Object.freeze({
    actionFocus: "若孕期出现出血、持续腹痛、严重头痛、视物异常或胎动明显减少，立即联系产科分诊或急诊评估",
    redFlagFocus: "若出现抽搐、昏厥、大量出血、胸痛或严重呼吸困难，应联系当地急救"
  }),
  "newborn-fever": Object.freeze({
    actionFocus: "若三个月以下婴儿测得发热，准确记录测温方式和时间并尽快联系儿科或急诊评估",
    redFlagFocus: "若出现呼吸异常、发绀、反应差、抽搐或难以唤醒，应联系当地急救"
  }),
  "pain-monitoring": Object.freeze({
    title: "开始活动时轻微酸痛可见，但持续、加重或影响功能的疼痛需要调整和评估",
    fact: "刚开始活动时可能出现轻微酸痛；关节或肢体疼痛持续、加重或影响功能时，不应只靠意志继续",
    actionFocus: "若活动引起关节或肢体疼痛，停止或降低活动，并向合格专业人员核对安全的恢复方式",
    completeAction: true
  }),
  "probiotic-strain": Object.freeze({
    actionFocus: "核对完整微生物名称、研究针对的具体用途和产品储存要求，不把一种产品的结果外推到所有益生菌"
  }),
  "b12-plant-diet": Object.freeze({
    actionFocus: "查看营养标签确认可靠的B12强化来源；植物性饮食者可与合格专业人员讨论补充和检测安排"
  }),
  "skin-self-check": Object.freeze({
    actionFocus: "熟悉自身痣和皮损，记录新发或持续变化，并请他人协助查看难见部位；自查不能替代诊断"
  }),
  "foodborne-clusters": Object.freeze({
    fact: "相似病例的共同食物史是调查线索；餐食时间、收据、包装和标签可帮助识别聚集",
    actionFocus: "保留包装、标签和购买信息，记录近期餐食，并按当地渠道报告聚集病例"
  }),
  "prenatal-continuity": Object.freeze({
    fact: "孕期持续接受专业照护，有助于筛查和处理血压、感染、营养以及母胎健康变化"
  }),
  "sti-window": Object.freeze({
    title: "检测项目和采样部位取决于性史、暴露部位与症状",
    fact: "许多性传播感染没有症状；血液、尿液以及阴道、咽部或直肠采样回答的问题不同，单一部位检测可能遗漏",
    actionFocus: "坦诚说明性史、暴露时间、部位和症状，由合格专业人员选择相应检测",
    completeAction: true
  }),
  "polypharmacy-goals": Object.freeze({
    title: "同时使用多种药物会增加相互作用和管理难度，需要定期核对",
    fact: "处方药、非处方药和补充剂可能出现重复成分、相互作用或服用混乱",
    actionFocus: "保存完整药物清单，与医生或药师逐项核对用途、重复成分和相互作用；不要自行骤停",
    completeAction: true
  }),
  "sepsis-recognition": Object.freeze({
    fact: "脓毒症是感染引起的危及生命的医疗急症，可能迅速导致器官衰竭",
    actionFocus: "若感染者明显变差，记录最后正常时间与变化速度，并立即按当地急救流程求助",
    redFlagFocus: "若出现意识混乱、呼吸困难、皮肤湿冷或花斑、极度虚弱或少尿，不要等待高热或其他症状集齐"
  }),
  "cardiac-arrest-aed": Object.freeze({
    actionFocus: "发现无反应且没有正常呼吸时，立即呼叫当地急救、开始胸外按压并尽快使用 AED；不要因尝试摸脉搏而长时间延误按压",
    completeAction: true,
    redFlagFocus: "无反应且没有正常呼吸，包括仅有叹息样喘气时"
  }),
  "adult-choking": Object.freeze({
    actionFocus: "能有效咳嗽时鼓励咳嗽；若无法说话、咳嗽或呼吸，立即求助并按受训流程实施背部拍击和腹部冲击；若失去反应，开始心肺复苏",
    completeAction: true,
    redFlagFocus: "只移除口中明显可见的异物，不要盲目伸手探取；婴儿、孕妇等流程不同",
    completeLimits: true
  }),
  "major-burn": Object.freeze({
    actionFocus: "脱离热源后立即用凉的流动水持续降温至少 20 分钟并呼叫急救；避免全身过度降温，尤其婴儿和老人；冷却后松散覆盖",
    completeAction: true,
    redFlagFocus: "面、颈、手、会阴、大面积、环形、电或化学烧伤以及吸入伤应立即按当地急救流程求助"
  }),
  "heat-stroke": Object.freeze({
    actionFocus: "移到阴凉处并去除外层衣物，立即呼叫急救；用凉湿床单、风扇或冷水擦拭降温，可在颈部和腋窝放置冷敷，持续监测反应和呼吸",
    completeAction: true
  }),
  "severe-hypoglycemia": Object.freeze({
    actionFocus: "不能吞咽、抽搐或昏迷时不要口服，立即呼叫急救；若本人已有胰高血糖素急救方案且施救者受过训练，可按该方案使用",
    completeAction: true
  }),
  "suicide-immediate": Object.freeze({
    actionFocus: "陪伴当事人，不让其独处；在确保自身安全的前提下减少可及手段，并立即联系当地急救或危机服务",
    completeAction: true
  }),
  "delirium-acute": Object.freeze({
    actionFocus: "突然混乱本身需要立即医疗评估；陪伴并带上用药清单和最后正常时间，不要让当事人自行驾车"
  }),
  "head-injury-observe": Object.freeze({
    redFlagFocus: "若出现反复呕吐、嗜睡加重、抽搐、瞳孔不等、无法唤醒或新发麻木无力等神经症状，应立即联系当地急救；其他持续或加重症状应尽快评估"
  }),
  "social-connection-quality": Object.freeze({
    redFlagFocus: "若正在遭受暴力、控制或威胁，优先离开危险并联系当地人身安全或家暴支持；有即时危险时呼叫急救，孤立伴自伤想法时联系危机服务"
  }),
  "mania-warning": Object.freeze({
    redFlagFocus: "若出现攻击、自伤、精神病性症状、危险驾驶或消费，或无法保证本人及他人安全，应立即联系当地急救或危机服务；不要独自承担看护"
  }),
  "gambling-chasing": Object.freeze({
    redFlagFocus: "若有自伤想法、家庭暴力或即时人身危险，应立即联系当地危机、急救或人身安全服务；债务与违法风险应同时联系当地合规支持"
  }),
  "burn-cool-water": Object.freeze({
    actionFocus: "移开热源，用凉的流动水持续降温至少 20 分钟；不要用冰，也不要强撕粘住的衣物，冷却后松散覆盖",
    redFlagFocus: "面、手、会阴、大面积、环形、电或化学烧伤、吸入伤、全层烧伤或休克迹象应立即联系当地急救"
  }),
  "insect-bite": Object.freeze({
    redFlagFocus: "呼吸困难、全身风团、面舌或咽喉肿胀，或反应迅速进展时应立即呼叫当地急救；其他高热、靶形皮疹或感染加重应尽快评估"
  }),
  "antibiotic-resistance-action": Object.freeze({
    redFlagFocus: "呼吸困难、面舌肿胀或严重过敏时应立即急救；感染伴意识混乱、气促、皮肤湿冷或花斑，或迅速恶化时应立即按脓毒症急救流程求助"
  }),
  "barrier-methods": Object.freeze({
    redFlagFocus: "性暴力后应尽快联系当地急诊或性暴力支持服务，处理有时间窗的预防与取证；有即时人身危险时呼叫急救，盆腔剧痛、高热或睾丸剧痛需急诊"
  }),
  "climate-distress": Object.freeze({
    redFlagFocus: "出现自伤或自杀想法，或无法保证安全时，应立即联系当地危机或急救服务；持续失眠、抑郁或灾后功能明显受损应尽快寻求专业支持"
  }),
  "postpartum-mental": Object.freeze({
    redFlagFocus: "出现自伤或伤婴想法、幻觉妄想、躁狂、极度混乱或无法保证安全时，应立即联系当地急救，并让可信任成人陪伴照护者与婴儿；其他持续或功能受损应尽快评估"
  }),
  "travel-source-time": Object.freeze({
    topic: "旅行健康信息",
    title: "旅行健康信息具有时效，出发前要复核目的地建议",
    fact: "目的地的传染病风险、疫苗建议和可获得的医疗资源会随时间变化",
    actionFocus: "出发前查询目的地官方旅行健康页面，记录查询日期，并在临行前复核疫苗、疫情与就医资源",
    redFlagFocus: "若旅行中出现严重症状，应按当地医疗与急救路径求助，不能只依赖出发前保存的静态信息",
    themeTags: "旅行；健康信息"
  })
});

const MEDICAL_EXTENSION_ROWS = rows(String.raw`
movement~warm-up-specific~运动准备~热身的作用是逐步进入任务，而不是提前耗尽体力~数分钟由慢到快的同类动作可提高肌肉温度并让心肺逐步适应，静态拉伸并不是所有运动前的唯一选择~按当天项目先做低强度版本，再加入关节活动和技术练习~胸痛、接近晕厥、异常气促或新发神经症状~whoActivity~caution~运动；准备
movement~cool-down-recovery~运动恢复~运动后骤停与主动放松带来的感受因项目而异~轻度走动可帮助心率和呼吸逐步回落，但没有证据要求每次必须完成固定仪式~高强度结束后留几分钟观察呼吸、补水并记录异常反应~持续胸闷、心悸伴头晕或呼吸无法恢复~whoActivity~caution~运动；恢复
movement~doms-timing~延迟性肌肉酸痛~训练后酸痛常在一天后更明显，不等同于训练是否有效~不熟悉的离心负荷更容易引起延迟性酸痛，疼痛强度不能作为增肌质量的评分~降低下一次相同动作的负荷并保留轻度日常活动~剧烈局部肿胀、尿色如茶、明显无力或疼痛迅速恶化~whoActivity~caution~肌肉；恢复
movement~progressive-load~渐进负荷~适应需要逐步增加刺激，也需要给组织恢复时间~一次同时增加重量、次数、频率和动作难度会让超负荷来源难以判断~每次优先调整一个变量并记录两三次训练后的反应~关节持续肿胀、夜间痛、不能负重或动作中突然锐痛~whoActivity~caution~训练；适应
movement~rest-days~恢复安排~恢复日不是完全不动，也不是忽略持续疼痛~睡眠、营养、训练经验和负荷都会影响所需恢复时间，固定天数不适合所有人~在高负荷日之间穿插轻活动或不同肌群任务并关注功能恢复~疲劳数周不缓解、运动能力明显下降或反复受伤~whoActivity~caution~恢复；计划
movement~sedentary-interruption~久坐中断~短暂起身的价值在于减少长时间连续静止~即使达到每周运动量，整天久坐仍是另一种行为暴露，二者不能互相抵消~利用通话、喝水或计时提醒每半小时到一小时改变姿势并走动~新发单侧腿肿痛、胸痛或突发呼吸困难~whoActivity~caution~久坐；循环
movement~walking-intensity-talk~步行强度~说话测试能粗略感受强度，但不能替代医学评估~中等强度时通常能说话但不容易连续唱歌，体能和药物会改变同一速度下的反应~从能持续的步速开始，以时间和主观用力共同记录进展~胸痛、晕厥、异常气促或运动后症状长时间不退~whoActivity~caution~步行；强度
movement~balance-practice~平衡能力~平衡像力量一样需要在安全条件下反复练习~单脚站立、变换支撑面和转身可逐步增加挑战，但靠墙或有人保护可降低跌倒风险~先在稳固桌边练习简单动作，再根据稳定程度升级~近期不明原因跌倒、突发眩晕、单侧无力或步态突然改变~whoActivity~caution~平衡；跌倒预防
movement~core-function~核心训练~核心功能不等于追求某一种腹部外形~躯干肌群参与传递力量与控制姿势，不存在一项动作能解决所有腰背问题~选择能保持呼吸和中立动作的练习，逐渐增加时间或阻力~运动诱发放射腿痛、进行性麻木无力或大小便控制改变~whoActivity~caution~核心；功能
movement~flexibility-specific~柔韧性~柔韧训练应服务于具体动作需求，而非比较谁更软~关节活动度受骨性结构、神经耐受和训练影响，强行追求极端范围可能增加刺激~在温暖状态下缓慢进入可控拉伸，不弹振也不压过锐痛~关节卡锁、急性肿胀、明显不稳或外伤后畸形~whoActivity~caution~柔韧；关节
movement~tendon-loading~肌腱适应~肌腱通常更偏好可控制的渐进负荷，而不是长期完全休息~不同肌腱和病程需要不同速度与强度，疼痛反应应结合第二天功能判断~在专业指导下选可量化动作，记录当天和次日疼痛与功能~突然啪响、明显凹陷、失去蹬地或抬臂能力~whoActivity~caution~肌腱；负荷
movement~ankle-sprain-first-days~踝关节扭伤~早期保护与逐步恢复活动需要平衡~轻度扭伤常可在疼痛允许下逐步负重，但严重程度不能只由肿胀颜色判断~短期抬高、适度加压并测试能否安全走四步~明显畸形、骨点压痛、无法负重或足部发冷麻木~medline~caution~外伤；踝关节
movement~fracture-clues~骨折警示~还能活动并不能完全排除骨折~部分骨折仍可短暂走动，判断需结合受伤机制、局部骨压痛、畸形和影像~固定受伤部位，避免反复测试并尽快评估高风险损伤~开放伤口见骨、肢体畸形、远端苍白麻木或剧痛~medline~urgent~外伤；骨骼
movement~back-stay-active~非特异性腰痛~多数普通腰痛不需要长期卧床~在可耐受范围保持日常活动通常比持续卧床更有利，但应先排查危险信号~减少诱发动作的剂量而非完全停动，逐步恢复走路和工作任务~新发大小便障碍、会阴麻木、进行性腿无力、发热或重大外伤~medline~caution~腰背；活动
movement~ergonomic-variation~工作姿势~没有一种姿势可以全天保持而仍然舒适~桌椅高度有帮助，但定期变换姿势、任务和视距往往比追求唯一标准坐姿更实际~把常用物放在易取范围，并在工作流程中安排起身和远眺~持续麻木无力、手部精细动作下降或夜间痛加重~whoActivity~general~职业健康；姿势
movement~lifting-load-close~搬举策略~负重越靠近身体，腰背力矩通常越小~稳固脚位、预判重量和避免边扭身边抬物比口号式保持某一腰部角度更重要~先试探重量，拆分大件或使用推车并在转向时移动双脚~急性剧痛伴腿无力、跌落砸伤或无法直立行走~whoActivity~caution~搬举；安全
movement~bone-loading~骨骼负荷~骨骼对负重与冲击的反应具有部位特异性~步行、抗阻和适当冲击各有作用，游泳虽有心肺价值却不能完全替代负重刺激~依据年龄、骨折史和基础能力组合负重与力量训练~近期脆性骨折、突然背痛伴身高下降或高跌倒风险~whoActivity~caution~骨骼；力量
movement~footwear-task~鞋与活动~合适的鞋取决于脚型、任务和既往问题~价格高或缓震厚不保证适合，每个人对鞋楦、稳定性和地面的反应不同~新鞋先短时试用，检查摩擦点并为长距离活动留磨合期~糖尿病足出现水泡、破溃、发红发热或感觉下降~medline~caution~足部；装备
movement~running-load-spikes~跑步负荷~突然增加总量和速度比单一跑姿更值得关注~训练表面、睡眠、既往伤病与力量共同影响跑步伤害风险~使用周记录识别里程或强度突增，并安排较轻的一周~局部骨痛、跛行、夜间痛或疼痛随每次跑步加重~whoActivity~caution~跑步；负荷
movement~swimming-buddy~游泳安全~会游泳不等于在所有水域都安全~水温、流速、能见度、饮酒和疲劳会显著改变风险，开放水域尤其不同于泳池~了解当地警示、与同伴同行并在救生员区域活动~失联、吸入水后持续咳喘、意识改变或低体温~medline~urgent~水上；安全
movement~arthritis-activity~关节炎活动~合理活动可帮助维持关节功能，而疼痛波动需要调整剂量~低冲击有氧、力量和活动度练习的组合常比单一项目更实用~在症状平稳时建立基线，发作期减少强度并保留温和活动~关节突然红肿发热伴发烧、外伤后不能负重或迅速恶化~whoActivity~caution~关节；慢病
movement~posture-myth~姿势观念~姿势与疼痛并非简单的一对一因果~同一姿势有人无症状，压力、睡眠和负荷也会影响疼痛体验~关注能否自由变换和完成任务，而不是反复纠正到僵硬~持续神经症状、外伤后畸形或功能进行性下降~whoActivity~general~姿势；疼痛科学
movement~chronic-disease-start~慢病运动起步~很多慢性病患者可从低剂量活动获益~安全起点取决于病情稳定性、症状、药物和既往活动，不能套用竞技训练计划~先增加日常步行或轻力量，并与照护团队核对特殊限制~静息胸痛、失代偿呼吸困难、晕厥或急性疾病发作~whoActivity~caution~慢病；运动
movement~exercise-snacks~碎片化活动~运动收益不要求每次都达到很长时段~多次短活动也能累积总量，对时间受限或体能较低者更易开始~把楼梯、快走和简单力量嵌入固定日程，逐周累计分钟数~活动中出现危险信号或症状明显超出平常~whoActivity~general~习惯；时间
movement~pain-monitoring~疼痛监测~训练中的轻微不适与组织损伤并非完全同义~疼痛位置、性质、持续时间和次日功能比单个零到十分评分提供更多信息~记录什么动作、多少剂量和多久恢复，据此小幅调整~锐痛、关节不稳、明显肿胀、麻木无力或症状持续升级~medline~caution~疼痛；记录
sleep~wake-time-anchor~昼夜节律~固定起床时间通常比强迫固定入睡时刻更可控~起床、光照和进食共同给生物钟提供时间线索，周末大幅延后会形成社会时差~先把起床时间稳定在可持续范围，起床后尽早接触自然光~连续失眠严重影响功能、躁狂样少睡不困或驾驶嗜睡~nhlbiSleep~caution~睡眠；时间
sleep~morning-light~晨间光照~早晨光线可帮助生物钟向更早方向调整~光照效果取决于时间、强度和个人节律，普通室内光常弱于户外日光~起床后在安全情况下到户外活动，并避免直视强光设备~眼病患者使用高强度光疗前需咨询，躁狂风险者也应谨慎~nhlbiSleep~caution~光照；节律
sleep~caffeine-duration~咖啡因~下午的咖啡因可能在夜间仍有作用~代谢速度差异很大，咖啡、茶、能量饮料和部分药物都可能含咖啡因~记录摄入时间与睡眠，尝试把最后一次逐步提前~心悸、胸痛、严重焦虑或大量能量饮料摄入后不适~nhlbiSleep~caution~睡眠；饮品
sleep~alcohol-fragmentation~酒精与睡眠~酒精可能让人更快困倦，却会破坏后半夜睡眠~它还会加重打鼾、呼吸暂停和夜间排尿，因此不能当作助眠方案~比较无酒精夜晚的夜醒和晨间状态，逐步减少依赖~意识受损、呕吐不能唤醒、呼吸慢或戒酒后震颤谵妄~nhlbiSleep~caution~酒精；睡眠
sleep~nap-dose~午睡~午睡的时间和长度会影响夜间睡意~较晚或过长的午睡可能减少夜间睡眠压力，但轮班者和睡眠不足者情形不同~若夜间入睡困难，先尝试把午睡提前并缩短~白天无法控制地入睡、驾驶嗜睡或突发肌无力~nhlbiSleep~caution~午睡；时间
sleep~screen-arousal~屏幕与入睡~屏幕影响不只来自蓝光，也来自内容带来的兴奋和时间占用~情绪激烈的信息、工作通知和持续滚动会推迟放松，即使开启夜间模式也可能如此~睡前设置结束点，把必要设备调暗并停止高唤醒内容~长期严重失眠、网络使用失控伴明显情绪或功能损害~nhlbiSleep~general~技术；睡眠
sleep~bedroom-temperature~睡眠环境~偏凉、安静和黑暗通常更利于睡眠，但舒适范围因人而异~绝对温度不是唯一标准，寝具、湿度、疾病和年龄都会改变体感~用小幅调整比较入睡、夜醒和晨间舒适度~高温环境伴意识混乱、无法降温或心肺症状~nhlbiSleep~caution~环境；睡眠
sleep~stimulus-control~失眠行为~长期清醒地躺在床上会强化床与焦虑清醒的联系~刺激控制通过困倦时上床、清醒过久时短暂离床来重新建立联系~在安全环境中做安静低光活动，困倦后再回床~严重抑郁、自伤想法、躁狂样状态或夜间跌倒高风险~nhlbiSleep~caution~失眠；行为
sleep~snoring-apnea~睡眠呼吸~响亮打鼾并不等于普通熟睡~反复呼吸暂停、憋醒、晨起头痛和白天嗜睡提示需要评估睡眠呼吸暂停~请同住者记录可观察表现并向专业人员说明白天功能~睡眠中发绀、长时间呼吸停止、胸痛或驾驶中打瞌睡~nhlbiSleep~urgent~呼吸；睡眠
sleep~restless-legs~不宁腿感~夜间静止时腿部难受并因活动缓解具有特征性~缺铁、妊娠、肾病和部分药物可能相关，不能只靠按摩判断原因~记录出现时间、诱因和药物，避免自行大量补铁~单侧腿突然肿痛发热、明显无力或伴胸痛气促~nhlbiSleep~caution~神经；睡眠
sleep~shift-work~轮班睡眠~轮班把工作时间与生物钟错开，单靠意志无法完全抵消~固定轮次、光照、通勤安全和家庭安排共同决定可行的睡眠窗口~尽量减少频繁反向轮换，提前计划暗室睡眠和下班交通~工作或驾驶中频繁失控入睡、事故风险或持续情绪恶化~nhlbiSleep~caution~职业；节律
sleep~jet-lag-direction~时差~向东旅行通常需要把生物钟提前，往往比向西更难~跨越时区数量、抵达时间和个体节律影响恢复速度~提前小幅调整作息，抵达后按目的地时间安排光照与餐食~基础病用药跨时区安排不清、严重失眠或意识异常~nhlbiSleep~general~旅行；节律
sleep~sleep-debt~睡眠债~连续少睡造成的功能损失不能用一次长睡完全抹平~补眠可改善部分困倦，但注意、代谢和情绪恢复可能需要更稳定的多晚睡眠~先恢复连续几晚充足机会，而不是依赖周末一次睡到很晚~极端嗜睡、意识改变、驾驶或操作机器时无法保持清醒~nhlbiSleep~caution~恢复；功能
sleep~weekend-shift~周末补觉~周末稍多睡可缓解困倦，但大幅推迟会增加周一重新调整难度~工作日睡眠不足和周末社会时差是两个需要分别处理的问题~优先延长工作日晚间睡眠，并把周末起床差控制在可持续范围~长期无法获得基本睡眠机会或日间功能持续下降~nhlbiSleep~general~时间；习惯
sleep~individual-duration~睡眠时长~推荐范围是群体参考，不是每个人必须达到同一数字~判断是否充足还应看白天清醒度、情绪、疾病和是否依赖刺激物硬撑~连续记录一到两周的机会、实际睡眠和日间表现~睡很久仍极度困倦、呼吸暂停表现或突发睡眠发作~nhlbiSleep~caution~睡眠；个体差异
sleep~adolescent-clock~青少年睡眠~青春期生物钟常自然后移，而上学时间可能要求过早起床~这不是简单懒惰，晚间光照、作业和社交活动又会进一步压缩睡眠~固定晨间起床与光照，同时把作业和设备结束时间前移~持续旷课、严重情绪变化、自伤想法或白天失控入睡~nhlbiSleep~caution~青少年；节律
sleep~older-sleep~老年睡眠~年龄增长会改变睡眠结构，但严重失眠和极度嗜睡不应一概归为老化~疼痛、夜尿、药物、呼吸和昼间活动都会影响夜间睡眠~复核药物与症状，增加白天光照和活动并保持规律~突然睡眠改变伴谵妄、跌倒、呼吸困难或新神经症状~nhlbiSleep~caution~老龄；睡眠
sleep~pregnancy-sleep~孕期睡眠~孕期激素、夜尿、反流和身体变化会影响睡眠~常见不等于必须忍受，严重打鼾、腿部症状或情绪问题仍需评估~记录主要干扰并与产检人员讨论安全的体位和处理方式~单侧腿肿痛、胸痛气促、严重头痛视物异常或胎动异常~nhlbiSleep~caution~孕期；睡眠
sleep~dream-memory~梦与记忆~做梦体验与睡眠阶段、觉醒时机和情绪相关~记得梦的多少不直接衡量睡眠质量，也不能据单个梦诊断心理状态~若梦境困扰，可记录频率、诱因和白天影响而非过度解释内容~反复噩梦伴创伤症状、自伤想法或睡眠中危险行为~nhlbiSleep~general~梦；记忆
sleep~sleep-paralysis~睡眠瘫痪~入睡或醒来时短暂不能动可能与快速眼动睡眠过渡有关~体验可能可怕但通常短暂，睡眠不足和作息紊乱可能增加发生~规律睡眠并记录是否伴幻觉、频率和日间嗜睡~伴白天突发肌无力、无法控制入睡或其他神经异常~nhlbiSleep~caution~睡眠；神经
sleep~parasomnia-safety~异态睡眠~梦游等行为的首要处理是降低夜间伤害机会~睡眠不足、酒精、发热和部分药物可能诱发，儿童与成人的评估重点不同~锁好危险区域、清理绊倒物并记录行为发生时段~持械、离家、受伤、成人新发或伴癫痫样表现~nhlbiSleep~urgent~睡眠；安全
sleep~drowsy-driving~困倦驾驶~困倦会延长反应时间，开窗或大声音乐不能可靠恢复警觉~微睡眠可能只持续数秒，却足以在高速行驶中造成严重事故~感觉眼皮沉重或频繁走神时安全停车，改由清醒者驾驶或休息~车辆行驶中无法保持清醒或已发生偏离车道和险情~nhlbiSleep~urgent~交通；睡眠
sleep~sleep-medicine-review~助眠药物~助眠药的收益、次日影响和依赖风险因药物与人而异~处方药、非处方抗组胺药、酒精和保健品之间可能叠加镇静~记录剂量、时间和次日表现，与开药者定期复核~呼吸变慢、难以唤醒、跌倒、异常行为或混合镇静物质~fdaMedicine~caution~用药；睡眠
sleep~tracker-limits~睡眠追踪设备~消费级设备通过动作和心率推测睡眠阶段，并非脑电诊断~适合观察长期作息趋势，却可能因逐夜数字引起不必要焦虑~关注数周趋势和主观功能，不因单晚评分自行用药~设备数据与严重症状矛盾、持续嗜睡或呼吸暂停表现~nhlbiSleep~general~技术；证据
sleep~meal-exercise-timing~节律线索~进食和运动时间也会向身体提供日夜线索~晚间剧烈运动或大餐对不同人的影响不同，不能简单规定统一截止点~一次只调整一个时间因素并观察一周的入睡和胃肠感受~运动诱发胸痛、夜间严重反流呛咳或无法进食~nhlbiSleep~general~时间；生活方式
nutrition~plate-pattern~膳食结构~一餐的整体组合通常比单一超级食物更重要~蔬果、全谷、蛋白来源和适量脂肪共同影响饱腹、营养与长期可持续性~先观察一周常见餐盘，再补足最缺少的一类食物~无法进食、持续呕吐、明显脱水或快速非自愿体重下降~whoDiet~general~营养；结构
nutrition~protein-distribution~蛋白质~全天分布蛋白质可能比把大部分集中在一餐更易满足需求~实际需要受体重、年龄、活动、肾病和总能量影响，越多不一定越好~在三餐中安排豆类、蛋奶、鱼肉或其他合适来源~肾病患者计划高蛋白、吞咽困难或明显肌肉流失~whoDiet~caution~蛋白质；肌肉
nutrition~whole-grain~全谷物~全谷保留更多麸皮和胚芽，但包装颜色不能证明它是全谷~配料表第一位和膳食纤维信息比营销词更有用~把部分精制主食换成能接受的燕麦、糙米或全麦制品~乳糜泻需核对麸质来源，吞咽或胃肠疾病者应个别调整~whoDiet~general~谷物；标签
nutrition~fiber-gradual~膳食纤维~纤维增加过快可能带来腹胀和排便变化~不同植物纤维影响不完全相同，足量液体和逐步增加更易耐受~每几天增加一种豆类、全谷、蔬果，并记录排便反应~便血、黑便、持续腹痛、呕吐或排气排便停止~niddkDigestive~caution~纤维；消化
nutrition~hydration-context~补水判断~尿色可提供线索，但受药物、维生素和疾病影响~口渴、活动、环境、饮食和尿量应结合判断，固定八杯水并非普适处方~高温或运动时分次饮水，关注体重与尿量的异常变化~意识混乱、无尿、持续呕吐或心肾病伴快速水肿~whoDiet~caution~饮水；环境
nutrition~electrolyte-use~电解质饮料~普通短时活动通常不需要额外高糖电解质饮料~长时高热出汗、持续腹泻或特殊疾病才可能改变水盐需求~先看活动时长、温度和饮食，再选择适量补液方案~严重脱水、持续水样腹泻、心肾病或自行大量补钾~whoDiet~caution~电解质；运动
nutrition~allergy-intolerance~食物反应~食物过敏涉及免疫反应，食物不耐受常通过其他机制发生~两者症状和风险不同，模糊地把所有不适称作过敏会影响饮食与急救准备~记录食物、时间、剂量和症状，并由专业人员判断是否需要检测~呼吸困难、喉咙紧、全身风团、反复呕吐或循环症状~medline~urgent~过敏；饮食
nutrition~lactose-dose~乳糖不耐受~乳糖不耐受的可耐受剂量因人而异~部分人能接受少量乳制品或与正餐同食，完全排除可能减少钙和维生素来源~用小剂量和不同乳制品比较症状，并安排替代营养~便血、持续腹泻、儿童生长问题或非自愿体重下降~niddkDigestive~caution~乳糖；消化
nutrition~celiac-testing~乳糜泻~乳糜泻是免疫性疾病，不等同于一般麸质不适~检测前自行长期无麸质可能使血液和活检结果变得难解释~怀疑时先与专业人员讨论检测，再决定是否严格无麸质~明显贫血、持续腹泻、体重下降或儿童生长迟缓~niddkDigestive~caution~麸质；免疫
nutrition~fodmap-temporary~低FODMAP饮食~低FODMAP通常是分阶段识别诱因的工具，不是永久越严越好~长期广泛限制可能降低饮食多样性并影响肠道微生物~在营养专业人员指导下完成短期限制、系统重新引入和个体化~便血、夜间症状、发热、贫血或快速体重下降~niddkDigestive~caution~肠道；饮食限制
nutrition~fermented-foods~发酵食品~发酵食品并不自动等于含有足量活性益生菌~加工、加热、菌株和储存会改变微生物，盐和糖含量也需要考虑~把它作为多样饮食的一部分，并查看配料与储存说明~免疫功能严重受损者使用活菌产品前应咨询~whoDiet~general~微生物；食品
nutrition~probiotic-strain~益生菌~益生菌效果具有菌株、剂量和适应证特异性~某产品对一种情况的研究不能推广到所有品牌和所有胃肠问题~核对完整菌株名称、研究用途和保质储存条件~严重免疫抑制、中心静脉导管或重症患者自行使用活菌~niddkDigestive~caution~益生菌；证据
nutrition~label-serving~营养标签~每份数值只有结合包装包含几份才有意义~小包装也可能标为多份，实际一次吃完会改变能量、钠和糖的总量~先看份量与总份数，再比较同类产品每百克或每份~特殊疾病饮食不要仅靠正面宣传词决定~whoDiet~general~标签；计算
nutrition~processing-nuance~食品加工~加工是连续谱，不能只凭是否加工判断营养价值~冷冻蔬菜、酸奶和全麦面包也经过加工，关键在配方、营养和替代了什么~比较配料、钠糖脂肪与食用频率，而非只看一个分类名称~进食障碍史者避免把食物标签变成僵化道德规则~whoDiet~general~食品；判断
nutrition~hidden-sodium~隐形钠~大部分钠可能来自加工食品、酱料和餐饮，而非餐桌盐罐~不同品牌同类食品的钠差异可很大，味道不咸也不代表低钠~查看每份钠和份数，用香草香料逐步替代部分高盐调味~低钠血症、心肾病用药者不要自行极端限盐或补盐~whoDiet~caution~钠；标签
nutrition~sugary-drinks~含糖饮料~液体糖通常饱腹感较弱，容易在不知不觉中增加总能量~汽水、甜茶、能量饮料和部分果汁都可能贡献大量游离糖~先用水、无糖茶或逐步减甜替换最常喝的一种~糖尿病治疗者改变摄入后需关注低血糖与用药匹配~whoDiet~general~糖；饮品
nutrition~trans-fat~反式脂肪~工业反式脂肪会增加心血管风险，部分地区已严格限制~配料中的部分氢化油比包装正面模糊的零反式脂肪宣传更值得核对~优先选择非氢化植物油、坚果和天然食材烹调~不要因关注单一脂肪而忽略总饮食与能量需求~whoDiet~general~脂肪；心血管
nutrition~omega-three-food~Omega-3脂肪酸~鱼类和补充剂不是完全可互换的营养来源~不同Omega-3类型、剂量和研究目的不同，高剂量补充剂还可能影响出血风险~通过合适鱼类、坚果种子等安排来源，补充剂先核对药物~服用抗凝药、出血异常或计划高剂量补充~fdaMedicine~caution~脂肪；用药
nutrition~iron-context~铁营养~疲劳不能单凭感觉诊断缺铁，补铁也并非越多越好~血红蛋白、铁储备、出血来源和炎症会共同影响判断~饮食搭配富铁食物与维生素C，怀疑缺铁时先检测原因~黑便便血、气促胸痛、妊娠期明显症状或儿童误食铁剂~medline~caution~铁；检查
nutrition~b12-plant-diet~维生素B12~严格植物性饮食通常需要可靠的B12强化食品或补充来源~缺乏可能影响血液和神经，症状出现时往往已持续一段时间~核对强化量与补充规律，高风险者按建议检测~麻木步态改变、认知变化、严重贫血或妊娠哺乳期缺乏风险~medline~caution~维生素；植物饮食
nutrition~calcium-sources~钙来源~钙不仅来自牛奶，吸收和总量也受食物类型影响~强化植物饮品、豆制品和部分绿叶菜可贡献钙，但标签与份量很关键~盘点日常来源后再决定是否需要补充剂~肾结石、甲状旁腺疾病或大剂量补钙与药物同服~medline~caution~钙；骨骼
nutrition~supplement-gap~营养补充剂~补充剂可填补特定缺口，却不能复制完整饮食~高剂量维生素和草药可能与处方药相互作用，天然不等于无风险~把全部补充剂加入用药清单，按明确目的和剂量使用~疑似肝损伤、严重过敏、出血或儿童误服~fdaMedicine~caution~补充剂；用药
nutrition~fluoride-toothpaste~含氟牙膏~适量氟化物能增强牙釉质抗龋能力~牙膏用量和吞咽风险随年龄不同，刷牙后不必用大量水反复冲洗~使用当地建议浓度的含氟牙膏，每天规律刷牙并定期口腔检查~面部肿胀、吞咽呼吸困难、牙外伤或持续口腔溃疡~medline~general~口腔；预防
nutrition~brushing-acid~酸性饮食后的刷牙时机~酸性食物或饮料后牙釉质表面会暂时更易磨损~立即用力刷牙可能增加机械磨耗，先用清水漱口并等待一段时间更稳妥~减少频繁小口喝酸饮料，使用软毛牙刷和温和力度~牙痛伴发热肿胀、面部扩散性肿胀或吞咽困难~medline~caution~口腔；饮食
nutrition~reflux-pattern~胃食管反流~反流触发因素具有个体差异，不需要机械禁掉所有常见食物~进餐量、躺下时间、体重、酒精和特定食物可共同影响症状~记录一两周进餐与症状，先调整最稳定的个人触发因素~吞咽困难、呕血黑便、持续胸痛或非自愿体重下降~niddkDigestive~caution~消化；记录
cardio~bp-cuff-size~血压测量~袖带尺寸不合适会系统性影响血压读数~测量前休息、手臂支撑、双脚落地和避免交谈也会提高可比性~使用适合上臂围的设备，连续多日同一时段记录两次~血压极高伴胸痛、神经症状、呼吸困难或视力改变~cdcHeart~caution~血压；测量
cardio~white-coat-masked~血压情境~诊室血压和日常血压可能不一致~白大衣性升高与隐匿性高血压方向相反，家庭或动态监测能补充单次诊室结果~带设备核对准确性，并按规范记录一周晨晚数值~家庭反复极高或极低并伴晕厥、胸痛或神经症状~cdcHeart~caution~血压；情境
cardio~irregular-pulse~脉搏节律~脉搏快慢和是否规则提供不同信息~运动、发热、药物和心律失常都可能改变脉搏，智能设备提示不能独立诊断~静坐后手工复核一分钟，并记录症状与发生时间~心悸伴晕厥、胸痛、严重气促或持续极快心率~cdcHeart~urgent~心律；记录
cardio~cholesterol-total-risk~胆固醇~单个胆固醇数字不能独立决定心血管风险~年龄、血压、吸烟、糖尿病、家族史及不同脂蛋白共同影响决策~保存完整化验和风险因素，与专业人员讨论绝对风险和选择~胸痛、卒中表现等急症不能等待血脂复查~cdcHeart~general~血脂；风险
cardio~triglyceride-context~甘油三酯~甘油三酯受进食、酒精、血糖和遗传影响~极高水平与胰腺炎风险相关，轻中度升高则需结合整体代谢风险~核对是否空腹及近期饮酒，按建议复查并改善饮食活动~剧烈持续上腹痛、反复呕吐或极高数值伴不适~cdcHeart~caution~血脂；代谢
cardio~a1c-limits~糖化血红蛋白~糖化血红蛋白反映一段时间平均血糖，但受红细胞情况影响~贫血、失血、输血、肾病和某些血红蛋白变异可使结果难解释~结合血糖记录和相关病史，与专业人员确认是否需其他检测~明显口渴多尿伴呕吐、意识变化或深快呼吸~niddkKidney~caution~糖代谢；检查
cardio~prediabetes-risk~糖尿病前期~糖尿病前期是风险区间，不是注定发展为糖尿病~体重、活动、睡眠、药物和遗传共同影响后续变化~选择可持续的饮食与活动目标，并按个人风险安排复查~妊娠、快速体重下降或典型高血糖症状需及时评估~cdcHeart~general~糖代谢；预防
cardio~postmeal-glucose~餐后血糖~同样一餐的血糖反应会受份量、搭配、活动和药物影响~偶尔一次高值不足以评价长期控制，测量时点也必须一致~记录餐食、测量时点和活动，观察多次模式而非追逐单点~使用降糖药后出汗发抖意识改变或持续极高血糖~niddkKidney~caution~血糖；记录
cardio~hypoglycemia-rule~低血糖~低血糖需要快速处理，也需要追查原因~含糖食物的速度和剂量不同，使用胰岛素或促泌剂者尤其要有个人计划~清醒能吞咽时按既定方案补充快速糖并复测，随后分析诱因~不能吞咽、抽搐、意识改变或处理后仍不恢复~medline~urgent~低血糖；急救
cardio~egfr-trend~肾小球滤过率估算~eGFR是估算值，趋势通常比单次小幅波动更有信息~肌肉量、脱水、急性病和药物会影响肌酐及估算，年龄也参与公式~保存历次结果并结合尿白蛋白、血压和病史判断~尿量骤减、严重水肿、呼吸困难或意识变化~niddkKidney~caution~肾脏；检查
cardio~albuminuria~尿白蛋白~尿白蛋白可在eGFR下降前提示肾脏损伤风险~剧烈运动、感染、发热和月经可能暂时影响结果，异常通常需确认~按要求留取样本并复查，结合糖尿病和血压管理~肉眼血尿、腰痛发热、妊娠高血压症状或尿量骤减~niddkKidney~caution~肾脏；筛查
cardio~nsaid-kidney~止痛药与肾脏~部分非甾体抗炎药会减少肾脏血流并影响血压~脱水、老龄、肾病、心衰及某些降压利尿药会增加风险~核对活性成分和用药天数，生病脱水时询问是否需要调整~少尿、快速水肿、黑便呕血、严重腹痛或过量服用~fdaMedicine~caution~肾脏；用药
cardio~edema-pattern~水肿~水肿是液体积聚表现，原因可来自静脉、心脏、肾脏、肝脏或药物~单靠按压凹陷不能判断病因，单侧与双侧的风险线索也不同~记录开始时间、左右差异、体重和呼吸症状并复核药物~单侧腿突然肿痛、胸痛气促、无法平卧或快速全身水肿~cdcHeart~urgent~水肿；风险
cardio~sodium-bp~钠与血压~减少过量钠摄入可帮助部分人降低血压~个体敏感性不同，主要来源常是加工食品和餐饮，极端限制也可能不安全~比较常用食品标签并逐步减少高钠来源，继续监测血压~心肾病、低钠血症或使用利尿药者大幅改变摄入前需咨询~cdcHeart~general~血压；营养
cardio~potassium-caution~钾摄入~富钾食物对许多人有益，但肾功能和药物会改变安全范围~某些降压药、保钾利尿剂和肾病可能导致高钾，盐替代品也常含钾~肾病或相关用药者在使用钾补充剂与低钠盐前核对~肌无力、心悸、晕厥或已知高钾伴症状~niddkKidney~caution~电解质；肾脏
cardio~dehydration-kidney~脱水与肾功能~持续失水可减少肾脏灌注并使部分药物风险上升~呕吐、腹泻、高热和高温工作都可能造成脱水，心衰患者补液又需个别化~小量多次补液并监测尿量，询问生病时药物管理方案~无法进液、无尿、意识混乱、严重头晕或心衰加重~niddkKidney~caution~脱水；肾脏
cardio~home-bp-average~家庭血压~多日平均值比挑选一次最好或最坏读数更可靠~固定时间、正确姿势和每次两次读数可减少随机波动~记录七天晨晚结果并带设备和清单就诊~重复极高读数伴症状或显著低压伴晕厥~cdcHeart~caution~血压；数据
cardio~orthostatic-bp~体位性低血压~从躺坐到站立时血压下降可引起头晕和跌倒~脱水、药物、自主神经问题和卧床后体能下降都可能参与~起身分阶段并扶稳，记录症状与药物时间~晕厥受伤、胸痛、神经症状或反复跌倒~cdcHeart~caution~血压；跌倒
cardio~exercise-heart-start~心血管活动~规律活动有益，但起点应匹配当前稳定程度~久未运动、已知心血管病和近期症状者不宜直接进入高强度计划~从可交谈强度的短时步行开始，逐步增加时长~运动中胸痛、晕厥、异常气促或持续心悸~cdcHeart~caution~心血管；运动
cardio~metabolic-syndrome~代谢综合征~多个风险因素聚集比单独一个指标更值得关注~腰围、血压、血糖、甘油三酯和高密度脂蛋白共同反映代谢风险，但定义存在差异~把改善活动、睡眠、饮食和复查整合成一份计划~单一标签不能替代糖尿病、心血管和肝肾疾病的具体评估~cdcHeart~general~代谢；风险
cardio~waist-context~腰围~腰围可补充体重指数对腹部脂肪分布的信息~测量位置、族群阈值、年龄和体型影响解释，不能作为个人价值判断~在同一位置和呼气末测量，结合其他风险因素看趋势~腹围短期迅速增大伴疼痛、呼吸困难或全身水肿~cdcHeart~general~代谢；测量
cardio~fatty-liver~脂肪性肝病~肝脏脂肪增加常与代谢风险相关，却可能长期没有症状~体重、糖代谢、酒精和药物需要共同评估，正常转氨酶不能完全排除~与专业人员讨论代谢风险、饮酒和是否需要影像或纤维化评估~黄疸、腹水、呕血黑便或意识改变~niddkKidney~caution~肝脏；代谢
cardio~gout-urate~痛风~尿酸升高增加痛风风险，但一次关节痛不等于痛风~饮食只是部分因素，肾功能、遗传和药物也影响尿酸~记录发作部位时间并核对利尿药等，确诊后讨论长期目标~首次关节红肿发热伴发烧需排除感染性关节炎~niddkKidney~caution~尿酸；关节
cardio~kidney-stone-fluid~肾结石~结石类型不同，预防策略也不完全相同~普遍增加液体常有帮助，但钠、钙、草酸和药物需依据结石成分调整~保存排出的结石和化验结果，按建议增加分散饮水~发热寒战伴腰痛、单肾无尿、持续呕吐或难以控制的疼痛~niddkKidney~urgent~肾脏；结石
cardio~risk-absolute~绝对风险~相对风险变化可能看起来很大，绝对风险才说明实际差多少~基线风险低与高的人，即使相对变化相同，实际获益人数也不同~询问在具体时间范围内每一百人可能减少多少事件~急性症状的处理不能等待长期风险计算~ahrqQuestions~general~风险沟通；决策
infection~respiratory-etiquette~呼吸道礼仪~咳嗽和喷嚏产生的飞沫可落到手和环境~用纸巾或肘部遮挡并及时清洁双手，比用裸手捂住后继续接触物品更稳妥~在公共场所备纸巾并在有症状时减少近距离接触~呼吸困难、发绀、意识变化或高风险人群迅速恶化~cdcInfection~caution~呼吸道；卫生
infection~ventilation-layers~室内通风~新鲜空气可降低室内累积的呼吸道颗粒浓度~效果受人数、空间、风向和机械系统影响，开一条小缝并非所有场景都足够~优先户外或改善对流，拥挤时叠加其他防护~有毒气体、极端天气或空气污染时不能机械开窗~cdcInfection~general~空气；感染
infection~mask-context~口罩使用~口罩效果取决于过滤、贴合、佩戴时间和场景~高质量但漏气的口罩可能不如正确贴合，潮湿破损后性能也会下降~在拥挤、医疗或高风险接触场景选择贴合良好的合规产品~明显呼吸困难者需先脱离危险并求助，儿童按年龄要求使用~cdcInfection~general~口罩；风险
infection~hand-sanitizer~手消毒剂~含足量酒精的手消毒剂适合多数看不见污物的场景~手明显脏、有化学物或某些腹泻病原体时，肥皂流水更合适~覆盖全部手表面并揉搓至干，远离火源和儿童~误饮、眼部大量接触或皮肤严重反应~cdcInfection~caution~手卫生；安全
infection~antibiotic-resistance-action~抗微生物药耐药~耐药的是微生物，不是人的身体产生习惯~不必要使用、剂量不当和传播都会加速耐药，但需要抗生素时也不应拒绝~只按处方使用，不分享剩药，并按复诊计划评估疗效~感染迅速恶化、脓毒症表现或严重药物过敏~cdcInfection~caution~抗生素；公共健康
infection~vaccine-record~疫苗记录~完整记录能避免漏种和不必要重复，也便于跨地区核对~推荐随年龄、健康状态、职业和旅行改变，并非成人接种一次后永久不变~保存纸质与数字副本，定期与正规接种机构核对~接种后呼吸困难、面舌肿胀、晕厥不恢复或严重神经症状~cdcVaccines~caution~疫苗；记录
infection~fever-signal~发热~发热是免疫反应信号，不等同于疾病严重程度~年龄、免疫状态、伴随症状和持续时间比追求把温度降到正常更重要~正确测温并记录饮水、精神状态和呼吸~婴幼儿高风险发热、意识改变、颈强直、呼吸困难或紫斑~medline~urgent~发热；风险
infection~presymptomatic-spread~症状前传播~部分感染在症状出现前已可传播~只在看起来生病时防护会遗漏早期传播，暴露史和流行情况也重要~高风险接触后按当地建议检测、通风并保护脆弱人群~高风险者出现症状应尽早联系医疗系统评估治疗窗口~cdcInfection~general~传播；时间
infection~incubation-window~潜伏期~暴露到发病的间隔因病原体和个体而异~一次过早阴性检测不能覆盖整个潜伏期，重复检测时点需按病种决定~记录暴露日期和症状起点，遵循当地检测时序~严重症状不应等待潜伏期结束或再次检测~cdcInfection~caution~时间；检测
infection~test-sensitivity-time~感染检测~检测灵敏度会随感染阶段、样本部位和采样质量变化~阴性结果降低某时点的可能性，却不保证完全排除~按说明采样并结合暴露、症状和重复检测策略~呼吸困难、脱水、意识变化等应按症状处理~cdcInfection~caution~检测；证据
infection~asymptomatic-infection~无症状感染~没有症状不代表完全没有感染或传播可能~筛查意义取决于流行水平、暴露和检测性能，不宜脱离场景解读~高风险暴露后保护脆弱人群并按指南安排检测~免疫抑制者暴露后应及时询问预防或早期治疗~cdcInfection~general~无症状；传播
infection~isolation-local-rules~隔离建议~隔离时长取决于病原体、病程和当地最新规定~旧截图或其他地区规则可能不适用，症状改善与传染性也不是同一概念~查看当地卫生机构更新并告知密切接触者~无法安全隔离、症状恶化或高风险家庭成员暴露~cdcInfection~general~规则；社区
infection~foodborne-clusters~食源性疾病~多人食用相同食物后相似发病是重要线索~症状可来自细菌、病毒、毒素或化学物，剩余食品和时间记录有助调查~保留包装和购买信息，补液并按当地渠道报告聚集病例~血便、高热、神经症状、严重脱水或孕妇高风险暴露~cdcInfection~urgent~食品；公共健康
infection~travel-vaccine-leadtime~旅行接种~部分旅行疫苗需要多剂或提前产生保护~目的地、季节、行程和基础病决定方案，临出发才咨询可能来不及~至少提前数周携带接种记录咨询旅行医学~高风险暴露后不要只等待疫苗，应询问暴露后处理~cdcTravel~general~旅行；疫苗
infection~mosquito-day-night~蚊媒防护~传播不同疾病的蚊种活跃时段并不相同~只在夜间防蚊可能遗漏白天叮咬，衣物、驱避剂和环境清理可叠加~按标签使用有效驱避剂，清除积水并使用纱网~旅行后发热、出血表现、严重头痛或意识改变~cdcTravel~caution~旅行；昆虫
infection~tick-removal~蜱叮咬~蜱附着时间和种类会影响部分疾病风险~用尖头镊靠近皮肤稳定拉出比涂油或烧灼更可靠~记录日期地点并保存清晰照片，之后观察症状~扩大的皮疹、发热、面瘫、严重头痛或呼吸症状~cdcTravel~caution~昆虫；记录
infection~rabies-exposure~狂犬病暴露~症状出现后的狂犬病几乎总是致命，但暴露后预防高度有效~抓咬、唾液接触破损皮肤以及蝙蝠暴露都需按地区评估~立即大量肥皂水冲洗伤口并尽快联系医疗机构~任何可疑哺乳动物暴露都不要等待动物或人出现症状~cdcTravel~urgent~动物；急救
infection~tetanus-wound~破伤风与伤口~破伤风风险取决于伤口类型和既往接种，而非铁锈本身~深刺伤、污染伤和坏死组织更需核对加强针及免疫球蛋白适应证~清洁伤口并携带接种记录接受评估~颌部僵硬、吞咽困难、肌肉痉挛或污染深伤~cdcVaccines~urgent~伤口；疫苗
infection~hiv-pep-time~HIV暴露后预防~暴露后预防越早开始越好，并有明确时间窗口~风险需结合体液、暴露部位、来源和防护，不能等待常规检测转阳~可能暴露后立即联系急诊或相关服务评估PEP~不要因羞耻或等待对方结果错过时限~cdcInfection~urgent~性健康；时间
infection~barrier-methods~屏障防护~正确持续使用屏障方法能降低多种性传播感染风险~不同感染的传播部位不同，屏障不能提供百分之百保护~学习正确使用并配合适时检测和疫苗~暴露后剧痛、发热、溃疡、孕期风险或性暴力~cdcInfection~caution~性健康；预防
infection~uti-hydration~尿路感染~尿频尿痛可提示尿路感染，但也可能来自其他问题~是否需要培养和抗生素受性别、妊娠、复发及全身症状影响~补充适量液体并及时留取清洁样本~发热寒战、腰痛、妊娠、呕吐或意识变化~niddkKidney~caution~泌尿；感染
infection~fungal-skin-dry~皮肤真菌~潮湿摩擦环境有利于部分真菌生长~相似皮疹也可能是湿疹或细菌感染，乱用含激素复方药可能掩盖表现~保持皱褶干燥，不共用毛巾鞋袜并按明确诊断治疗~糖尿病足破溃、迅速扩散、发热或免疫抑制者感染~medline~caution~皮肤；卫生
infection~conjunctivitis-hygiene~结膜炎~红眼可由病毒、细菌、过敏或刺激引起~并非所有结膜炎都需要抗生素，接触镜使用者风险评估不同~停戴隐形眼镜、洗手且不共用毛巾化妆品~眼痛、畏光、视力下降、外伤或化学品接触~medline~urgent~眼睛；感染
infection~sepsis-recognition~脓毒症~脓毒症是感染引起的危及生命器官功能障碍~高热不是必需表现，低体温、意识改变、呼吸快和尿量减少也重要~感染者明显变差时及时说明基线和变化速度~意识混乱、呼吸困难、皮肤花斑、极度虚弱或少尿~cdcInfection~urgent~感染；急症
infection~immunosuppressed-plan~免疫抑制~免疫抑制者感染症状可能不典型且进展更快~药物类型、移植、化疗和基础病决定防护与就医阈值~与照护团队预先明确发热、暴露和疫苗处理计划~发热或体温异常、呼吸症状、意识变化或无法进食~cdcInfection~urgent~免疫；计划
mental~stress-response~压力反应~压力可同时改变注意、睡眠、肌肉张力和消化~短期反应有适应意义，长期高负荷则可能损害功能~识别可控任务与不可控因素，每天安排一个恢复活动~持续无法工作生活、惊恐频发、自伤想法或物质使用失控~nimhMental~caution~压力；身心
mental~slow-exhale~呼吸练习~延长呼气可帮助部分人降低生理唤醒~它是调节工具而非治疗所有焦虑，过度深呼吸反而可能头晕~用舒适幅度缓慢呼吸一两分钟并关注脚下触感~胸痛、晕厥、严重气促或呼吸练习触发创伤反应~nimhMental~general~呼吸；情绪
mental~behavioral-activation~行为激活~情绪低落时等待有动力再行动可能形成回避循环~把活动拆成很小的可完成步骤能重新提供奖励与掌控感~安排一项十分钟的必要或有价值行动并记录完成感受~持续严重抑郁、自伤想法、无法进食饮水或精神病性症状~nimhMental~caution~抑郁；行动
mental~social-connection-quality~社会连接~连接质量比联系人数量更能影响支持感~稳定、互惠且可求助的关系可缓冲压力，社交媒体数量不能等同真实支持~定期联系一位可信任的人并具体表达需要~遭受暴力、控制、威胁或因孤立出现危机~nimhMental~caution~关系；支持
mental~loneliness-signal~孤独感~孤独是主观缺乏连接，不等同于独处时间多~有人群陪伴仍可能孤独，独处也可能带来恢复~选择低压力、可重复的小型社群活动建立熟悉感~孤独伴严重抑郁、自伤想法或长期功能下降~nimhMental~caution~孤独；社区
mental~grief-variation~哀伤~哀伤没有所有人都必须依次经历的固定阶段~情绪可反复波动，纪念、文化和关系会影响过程~允许节奏差异并保留饮食睡眠和必要社会支持~长期无法维持基本生活、物质滥用、自伤或精神病性表现~nimhMental~caution~哀伤；关系
mental~panic-wave~惊恐发作~惊恐症状往往迅速上升后逐渐回落，但感受非常真实~胸闷心悸和濒死感也可能来自身体急症，首次或异常表现需谨慎~在安全处放慢呼吸并记录持续时间和诱因~首次剧烈胸痛、晕厥、神经症状或症状与既往明显不同~nimhMental~urgent~惊恐；风险
mental~depression-function~抑郁识别~抑郁不仅是悲伤，也可表现为兴趣下降、疲劳和认知困难~持续时间与功能影响比一天心情差更关键，身体疾病和药物也需排查~记录两周症状与睡眠食欲，向专业人员求助~自伤想法、无法自理、拒绝进食或明显精神病性症状~nimhMental~urgent~抑郁；功能
mental~mania-warning~躁狂警示~明显少睡却不困、思维加速和冲动增加可能提示躁狂~它不同于普通精力好，常伴判断受损并造成财务、关系或安全风险~由可信任的人协助减少刺激和高风险决定并尽快评估~数日不睡、危险驾驶消费、攻击、自伤或精神病性症状~nimhMental~urgent~情绪；急症
mental~psychosis-early~精神病性症状~幻觉或妄想需要结合文化、物质、睡眠和疾病评估~争辩内容常无助于安全，保持平静和减少刺激更重要~倾听感受并联系当地精神健康服务~有伤害命令、极度恐惧、攻击风险、无法进食或意识异常~nimhMental~urgent~精神健康；安全
mental~suicide-direct-question~自杀风险~直接、平静地询问自杀想法不会把念头植入对方~明确计划、手段、时间和既往行为会提高紧迫性~陪伴并移开可安全移除的致命手段，联系当地危机或急救服务~已有计划手段、正在行动、告别或无法保证短期安全~nimhMental~urgent~自杀预防；沟通
mental~sleep-mood-loop~睡眠与情绪~睡眠和情绪可双向影响，单独处理其中一端可能不够~失眠可加重焦虑抑郁，躁狂则可能以少睡不困为线索~同时记录睡眠和情绪变化，保持规律起床时间~数日几乎不睡伴兴奋冲动或自伤危机~nimhMental~caution~睡眠；情绪
mental~exercise-mental~活动与心理健康~规律活动可支持情绪，但不是要求患者靠意志战胜疾病~小剂量、可选择且不带惩罚性的活动更易持续~从散步或伸展开始并保留专业治疗~运动被用于强迫补偿进食或伴胸痛晕厥~nimhMental~general~运动；情绪
mental~substance-coping~物质应对~用酒精或药物短期麻痹压力可能形成反弹和依赖~耐受、戒断和失控使用是风险信号，而不是道德失败~记录使用量、情境和后果，寻求保密专业支持~过量、意识下降、呼吸慢、严重戒断或自伤风险~nimhMental~urgent~成瘾；压力
mental~nicotine-dependence~尼古丁依赖~尼古丁可短暂缓解戒断不适，从而被误解为降低基础压力~吸烟、电子烟和口含产品都可维持依赖~设定戒烟日并组合行为支持与合适药物~胸痛、呼吸困难、孕期使用或儿童误食烟液~medline~caution~尼古丁；成瘾
mental~alcohol-standard~酒精单位~一杯的容器大小不等于一个标准饮酒单位~啤酒、葡萄酒和烈酒浓度不同，家庭倒酒常低估实际量~查看容量和酒精度并记录每周无酒精日~断酒后震颤幻觉、呕吐不能唤醒或呼吸慢~medline~urgent~酒精；计算
mental~cannabis-cognition~大麻与认知~大麻可影响注意、反应和短期记忆~效力、使用方式、年龄和与酒精同用会改变风险~避免驾驶和高风险操作，记录对学习工作与睡眠的影响~严重焦虑精神病性症状、胸痛或儿童误食~nimhMental~caution~物质；认知
mental~gambling-chasing~赌博风险~追损会把偶然损失转化为不断加码的循环~隐瞒、借钱和无法停止比单次金额更能提示问题~设置资金与时间隔离，主动寻求成瘾支持~债务危机、自伤想法、家庭暴力或违法风险~nimhMental~urgent~成瘾；财务
mental~digital-boundaries~数字负荷~持续通知和信息切换会消耗注意与恢复时间~问题不只在屏幕时长，也在内容、控制感和对睡眠工作的挤占~关闭非必要通知并设置无设备时段~网络使用失控伴严重睡眠、学业工作或关系损害~nimhMental~general~技术；注意
mental~mindfulness-choice~正念练习~正念训练注意与接纳，并非要求停止所有思绪~部分创伤经历者闭眼内观可能不舒服，可选择开放眼睛或外部感官锚点~从一分钟听声音或感受脚底开始，不强迫坚持~练习引发闪回、解离、惊恐或明显恶化~nimhMental~caution~正念；感知
mental~trauma-control~创伤反应~创伤后警觉、回避和侵入性记忆是可理解的反应~强迫详细复述并非所有阶段都安全，控制感和稳定支持很重要~先建立当下安全与作息，再由受训人员评估治疗选择~持续危险、严重解离、自伤、暴力或无法照顾自己~nimhMental~urgent~创伤；安全
mental~burnout-boundary~职业耗竭~耗竭描述长期工作压力相关现象，不替代抑郁或身体疾病评估~休假可能短暂缓解，但工作量、控制和支持结构也需改变~记录最消耗的任务并与组织讨论可执行调整~严重抑郁、自伤、胸痛或持续功能丧失~nimhMental~caution~职业；压力
mental~adult-adhd-assessment~成人注意问题~注意困难可来自ADHD，也可来自睡眠、焦虑、抑郁或物质~诊断需回顾童年与多场景功能，不能只凭网络问卷~收集学习工作史和具体实例接受规范评估~突然出现认知变化、神经症状或躁狂样少睡冲动~nimhMental~caution~注意；评估
mental~brain-health-multifactor~认知健康~没有一种补充剂被证明能单独保证预防痴呆~血压、活动、听力、睡眠、社交和教育等多因素共同相关~优先管理可改变风险并保持有挑战的日常活动~突然混乱、单侧无力、语言障碍或快速功能下降~niaBrain~caution~认知；预防
mental~caregiver-strain~照护者压力~长期照护可能同时带来意义、疲惫、哀伤和经济压力~忽视照护者需求会增加健康问题和照护中断风险~建立替代照护、紧急联系人和固定休息时段~照护者或被照护者出现暴力、自伤、走失或无法维持基本照护~niaOlder~caution~照护；支持
senses~twenty-rule~近距离用眼~定期看远能打断长时间近距离聚焦，但二十秒并非医学硬阈值~眨眼减少、环境眩光和不合适视力矫正也会造成疲劳~每段工作主动眨眼、远眺并调整字体和屏幕距离~眼痛、畏光、突然视力下降或神经症状~neiEye~general~视力；工作
senses~dry-eye-blinking~干眼~屏幕工作时眨眼频率下降会加重泪膜蒸发~药物、环境、睑板腺和自身免疫病也可能参与~增加完整眨眼、避开直吹风并按专业建议用润滑剂~明显红痛、畏光、视力下降或接触镜相关疼痛~neiEye~caution~眼睛；环境
senses~sudden-vision-loss~突然视力下降~单眼或双眼突然视力变化可能是时间敏感急症~即使无痛也不能等待自行恢复，原因可来自视网膜、血管或神经~记录最后正常时间并立即联系急救眼科~黑幕样遮挡、神经症状、剧烈头痛或眼外伤~neiEye~urgent~视力；急症
senses~flashes-floaters~闪光与飞蚊~新发大量飞蚊或闪光可能提示玻璃体牵拉或视网膜裂孔~老飞蚊稳定与突然变化的风险不同~分别遮眼观察范围并尽快接受散瞳眼底检查~黑幕、视野缺损、突然大量飞蚊或视力下降~neiEye~urgent~视网膜；急症
senses~cataract-gradual~白内障~白内障通常造成渐进的模糊、眩光和颜色变化~手术时机取决于日常功能而非成熟程度单一说法~更新验光、改善照明并记录驾驶阅读受影响程度~突然疼痛红眼或快速视力下降并非普通白内障进程~neiEye~general~视力；老龄
senses~glaucoma-silent~青光眼~部分青光眼早期没有明显症状，却可逐渐损害视神经~眼压只是风险因素之一，视野和视神经检查同样重要~有家族史或高风险者按建议定期检查~急性眼痛、头痛恶心、彩虹圈和视力下降~neiEye~urgent~视神经；筛查
senses~noise-dose~噪声剂量~听力风险同时取决于声级和暴露时间~声音每增加一定幅度，可安全暴露时间会明显缩短~在高噪环境使用合适护听器并安排安静恢复~爆炸声后突然听力下降、耳痛流血或严重眩晕~cdcHearing~caution~听力；职业
senses~headphone-breaks~耳机听音~音量、时长和耳机隔音共同决定听音风险~嘈杂环境中容易不知不觉调高音量，固定百分比并非适合所有设备~使用降噪或更安静环境，定时休息并关注耳鸣~听后耳鸣持续、耳闷或听力明显下降~cdcHearing~caution~听力；技术
senses~tinnitus-context~耳鸣~耳鸣是症状而不是单一疾病~听力损失、噪声、药物、颌颈因素和压力都可能相关~记录单侧或双侧、节律性和伴随听力变化~搏动性耳鸣、单侧突然听力下降、神经症状或严重眩晕~cdcHearing~caution~耳鸣；评估
senses~earwax-safe~耳垢~耳垢具有保护作用，通常会自行向外移动~棉签深入耳道可能把耳垢推深或损伤鼓膜~只清洁外耳，堵塞或助听器使用者咨询合适处理~耳痛流脓、突聋、鼓膜穿孔史或异物~medline~caution~耳朵；卫生
senses~vertigo-pattern~眩晕~旋转感、站立不稳和接近晕厥不是同一种症状~持续时间、体位诱发、听力与神经表现帮助区分原因~坐下防跌并记录诱因、方向和持续时间~单侧无力、言语不清、剧烈头痛、无法行走或胸痛~medline~urgent~平衡；神经
senses~smell-loss-safety~嗅觉下降~嗅觉变化会影响食欲、烟气和变质食物识别~感染、鼻病、药物和神经疾病均可能相关~检查烟雾和燃气报警器并标记食品日期~突然伴神经症状、头部外伤或持续单侧鼻出血~medline~caution~嗅觉；安全
senses~sunscreen-application~防晒~防晒霜标称防护需要足量、均匀和按情境补涂~衣物、遮阴和避开强日照可与防晒霜叠加~出门前覆盖暴露皮肤，游泳出汗后按标签补涂~严重晒伤伴水疱、发热、脱水或意识变化~medline~general~皮肤；紫外线
senses~uv-index~紫外线指数~阴天仍可能有较高紫外线，温度也不能代表紫外线强度~指数越高，无保护皮肤受损越快~查看当地指数并安排遮阴、衣物、帽子和眼镜~眼痛视力变化或大面积严重晒伤~medline~general~紫外线；天气
senses~skin-self-check~皮肤自查~熟悉自身痣和皮损的变化比寻找所谓完美正常外观更实用~不对称、边界、颜色、直径和演变是线索，不是自我诊断规则~定期在同样光线拍照比较并检查难见部位~快速变化、反复出血、久不愈合或新发可疑皮损~medline~caution~皮肤；记录
senses~acne-gentle~痤疮~过度清洁和挤压会增加刺激与瘢痕风险~治疗通常需要数周才显效，油性不等于污垢造成~温和清洁并一次引入一种非处方成分~深部疼痛结节、明显瘢痕、妊娠用药或严重心理影响~medline~caution~皮肤；护理
senses~eczema-barrier~湿疹~皮肤屏障受损会增加干燥、瘙痒和炎症循环~香精、热水、摩擦和感染可能加重，但触发因素因人而异~短时温水清洁并立即使用无香保湿剂~渗液黄痂、迅速扩散、发热或眼周严重皮疹~medline~caution~皮肤屏障；炎症
senses~psoriasis-systemic~银屑病~银屑病不仅是表面皮屑，也可能与关节和代谢风险相关~传染误解会增加污名，治疗需按范围和部位选择~记录皮损、指甲和晨僵并持续保湿~红皮面积广、发热、关节明显肿痛或眼症状~medline~caution~皮肤；免疫
senses~wound-moist-cover~小伤口~清洁后适度湿润覆盖通常有利于表皮修复~反复使用刺激性消毒剂可能伤害新生组织，污染程度仍需判断~用流动清水清洗、覆盖并观察红肿范围~深伤、动物咬伤、异物、止不住血或感染扩散~medline~caution~伤口；护理
senses~burn-cool-water~热烧伤~尽快用凉的流动水降温能限制持续热损伤~冰块和牙膏可能造成额外损伤，衣物粘住时不应强撕~移开热源并持续凉水冲洗后松散覆盖~面手生殖器大面积、环形、电烧伤、吸入伤或深色焦白~nhsFirstAid~urgent~烧伤；急救
senses~pressure-injury~压力性损伤~持续压力和剪切会损伤皮肤及深部组织~不能活动、感觉下降、潮湿和营养问题会增加风险~定期改变受力点并每日检查骨突处皮肤~皮肤紫黑、水疱、开放伤口、发热或恶臭渗液~medline~caution~皮肤；照护
senses~nail-fungus~甲真菌病~指趾甲增厚变色并不一定都是真菌~外伤、银屑病和循环问题可能相似，口服药还需评估肝脏与相互作用~确诊后再选择局部或口服方案并保持足部干燥~糖尿病足红肿破溃、蜂窝织炎或疼痛迅速加重~medline~caution~指甲；感染
senses~hair-loss-pattern~脱发~脱发模式、速度和头皮表现比每天数头发更有信息~产后、压力、甲状腺、缺铁、药物和遗传均可能参与~拍照记录发缝与区域，核对近期疾病、饮食和用药~突然片状脱发伴炎症、瘢痕、全身症状或儿童脱发~medline~caution~毛发；评估
senses~contact-dermatitis~接触性皮炎~接触性皮炎可来自刺激或迟发过敏~反复少量暴露也能累积，皮疹位置常提示接触物~列出新清洁剂、金属、手套和护肤品并减少暴露~面舌肿胀呼吸困难、大面积水疱或职业暴露持续~medline~caution~皮肤；过敏
senses~insect-bite~昆虫叮咬~多数局部红痒会自行缓解，但反应和传播风险因地区而异~抓挠可继发感染，蜱、蚊和蜂蜇的处理不同~清洁并冷敷，记录地点时间及皮疹扩展~呼吸困难、全身风团、面舌肿胀、高热或靶形皮疹~medline~urgent~昆虫；皮肤
medicines~active-ingredient~药品成分~品牌不同的药可能含相同活性成分~叠加感冒药、止痛药和助眠药时最容易重复用药~每次购买先比较活性成分与单次每日上限~过量、意识下降、呼吸慢、严重过敏或肝损伤表现~fdaMedicine~caution~用药；标签
medicines~single-med-list~用药清单~一份持续更新的清单能减少跨机构信息遗漏~处方药、非处方药、草药、补充剂和过敏反应都应包含~记录通用名、剂量、用途和最后调整日期~急诊时无法提供清单不应延误救治~fdaMedicine~general~用药；记录
medicines~adherence-barriers~服药依从~漏药常来自复杂方案、费用、理解或副作用，而不只是忘记~识别具体障碍比责备更容易找到安全方案~把最常漏的一剂与固定日常动作关联并告知开药者~不要自行加倍补服或突然停用高风险处方~fdaMedicine~caution~用药；行为
medicines~pill-organizer-limits~分药盒~分药盒有助提醒，却不适合所有药和所有储存条件~避光、防潮、原包装识别和按需用药可能受影响~先让药师确认哪些药可提前分装并保留原标签~儿童误服、分装混淆或药片外观改变~fdaMedicine~caution~用药；安全
medicines~food-interaction~食物相互作用~食物可改变部分药物吸收、代谢或胃肠耐受~空腹或随餐要求具有药物特异性，不能套用统一规则~按同一时间与食物方式服用并核对说明书~严重呕吐、过敏、出血或药效突然异常~fdaMedicine~caution~用药；饮食
medicines~grapefruit~葡萄柚相互作用~葡萄柚可抑制部分药物代谢，影响可持续数日~不是所有柑橘都相同，也不是所有同类药都受影响~若说明书提示，连果汁和相关柑橘一起向药师核对~心悸、严重肌痛、晕厥或药物毒性表现~fdaMedicine~caution~用药；相互作用
medicines~otc-overlap~非处方药重叠~复方产品会隐藏退热、抗过敏或镇咳成分~只按商品名轮换可能超过同一成分上限~列出每种活性成分和时间再决定下一剂~儿童误服、过量、难唤醒或呼吸异常~fdaMedicine~urgent~用药；标签
medicines~nsaid-risk~非甾体止痛药~非甾体抗炎药可影响胃、肾、血压和心血管风险~年龄、溃疡、肾病、抗凝药和脱水会改变安全性~用最低有效剂量和最短时间并核对禁忌~黑便呕血、胸痛、少尿、面舌肿胀或喘息~fdaMedicine~urgent~止痛药；风险
medicines~acetaminophen-total~对乙酰氨基酚总量~对乙酰氨基酚过量可严重损伤肝脏，早期症状可能轻~感冒复方和处方止痛药也可能含同一成分~计算二十四小时全部来源并避免与大量饮酒同用~疑似超量即联系毒物或急救，不等待症状~fdaMedicine~urgent~止痛药；过量
medicines~antibiotic-duration~抗生素疗程~疗程长短由感染类型、药物和反应决定，并非一律越长越好~自行停药或延长都可能带来失败与副作用~按处方时间使用并在未改善或副作用时联系开药者~严重腹泻、过敏、黄疸或感染迅速恶化~fdaMedicine~caution~抗生素；疗程
medicines~expired-medicine~过期药~过期日期之后稳定性和效力不再由生产者保证~某些液体、注射和急救药尤其不宜依赖~定期检查家庭药箱并按当地渠道更换关键药~紧急情况不要依赖已失效或储存异常的药~fdaMedicine~caution~用药；储存
medicines~safe-disposal~药品处置~随意丢弃或长期囤积会增加误服和环境风险~优先使用回收点，少数高风险药按官方清单有特殊处置~去除个人标签并查看当地药品回收安排~疑似儿童或宠物误食立即联系急救或毒物中心~fdaMedicine~general~用药；环境
medicines~supplement-quality~补充剂质量~补充剂上市前审查与处方药不同，标签与实际成分可能不一致~减肥、增肌和性功能产品较易掺杂未标成分~选择可追溯产品并向药师披露全部补充剂~黄疸、胸痛、严重心悸、出血或过敏~fdaMedicine~caution~补充剂；质量
medicines~pregnancy-medication~孕期用药~孕期停药和继续用药都可能有风险~风险随孕周、剂量、疾病和替代方案不同，不能只看一个字母等级~计划或确认妊娠后尽快与开药者逐项复核~不要突然停用抗癫痫、精神科等重要药物~fdaMedicine~caution~孕期；用药
medicines~kidney-dose~肾功能与剂量~部分药物或代谢物经肾排泄，需要按功能调整~eGFR变化、急性脱水和年龄可使原剂量不再合适~每次新开药说明肾病和近期化验，急病时复核~嗜睡意识改变、少尿、心律异常或严重药物反应~fdaMedicine~caution~肾脏；剂量
medicines~allergy-vs-side-effect~药物过敏记录~恶心等副作用与过敏并不相同，错误标签会限制未来选择~真正的风团、喉头症状和严重皮肤反应需详细记录时间与药物~把反应表现和发生时间写进清单而非只写过敏~呼吸困难、面舌肿胀、水疱脱皮或循环不稳~fdaMedicine~urgent~过敏；记录
medicines~reference-range~化验参考区间~参考区间描述特定实验室人群，不是健康与疾病的绝对边界~单位、方法、年龄、妊娠和临床目标会改变解释~始终保留单位与区间，比较同一实验室的趋势~危急值通知或严重症状不应等待自行上网解释~ahrqQuestions~general~检查；数据
medicines~false-positive~假阳性~检测越多，偶然异常的机会越大~低风险人群中即使特异度高，阳性结果也可能需要确认~询问检测前概率、确认方法和结果会如何改变处理~不要因筛查阳性自行停药或开始侵入性治疗~ahrqQuestions~general~检测；概率
medicines~contrast-agent~影像对比剂~不同对比剂的风险机制和适用检查并不相同~肾功能、既往反应、甲状腺和妊娠信息可能影响选择~检查前提供既往反应细节和近期肾功能~注射后呼吸困难、面舌肿胀、晕厥或严重皮疹~fdaMedicine~urgent~影像；过敏
medicines~radiation-benefit~医学辐射~X线和CT使用电离辐射，是否值得取决于临床收益~有效剂量因检查而异，超声与MRI不使用电离辐射~询问结果会怎样改变处理并保存既往影像~时间敏感急症不要因抽象辐射担忧拒绝必要检查~fdaMedicine~general~影像；权衡
medicines~screening-diagnosis~筛查与诊断~筛查面向无症状风险人群，诊断检查用于解释症状或异常~二者的阈值、收益和后续路径不同~出现症状时说明症状，不要只要求常规筛查~危险症状即使近期筛查正常也需评估~uspstf~general~检查；概念
medicines~shared-decision~共同决策~共同决策把证据与个人目标放到同一张桌上~选择不只是同意或拒绝，还包括等待、替代和复查~询问每个选项的绝对获益、风险和不确定性~急症稳定处理优先，之后再讨论偏好~ahrqQuestions~general~决策；沟通
medicines~teach-back~回述确认~让患者用自己的话回述可发现沟通遗漏~这不是考试，而是检查解释是否清楚~离开前回述剂量、下一步和何时求助~若仍不清楚高风险药用法应暂停并即时核对~ahrqQuestions~general~健康素养；沟通
medicines~misinformation-check~健康信息核查~专业外观、名人背书和大量转发都不能证明健康主张~可靠内容应说明来源、日期、适用人群和不确定性~先找原始指南或监管信息并与独立来源交叉核对~不要据网帖停处方药、购买不明注射或延误急救~ahrqQuestions~caution~信息；证据
medicines~health-app-privacy~健康应用隐私~健康应用收集的数据不一定受到与医院病历相同的保护~权限、第三方分享、删除机制和商业模式决定实际风险~关闭非必要权限并在输入敏感信息前读隐私摘要~账号泄露或勒索时及时改密并联系相关机构~ahrqQuestions~general~隐私；技术
urgent~stroke-last-known-well~卒中急救~卒中治疗依赖时间，最后正常时间比发现时间更关键~睡醒发现症状时也应记录睡前最后正常时刻~出现脸歪、臂无力或言语异常立即呼叫急救~即使症状数分钟恢复也可能是短暂性脑缺血发作~nhsFirstAid~urgent~卒中；时间
urgent~heart-attack-varied~心肌梗死警示~心肌梗死不一定只有典型压榨性胸痛~女性、老年和糖尿病患者可能以气促、恶心或异常疲乏表现~停止活动并呼叫当地急救，不自行驾车~胸部不适、冷汗、气促或疼痛放射至臂颌背部~nhsFirstAid~urgent~心脏；急救
urgent~cardiac-arrest-aed~心脏骤停~无反应且没有正常呼吸应按心脏骤停处理~叹息样喘气不是正常呼吸，旁观者立即行动可提高生存机会~呼叫急救、开始胸外按压并尽快使用AED~不要因不确定脉搏而长时间推迟按压~nhsFirstAid~urgent~复苏；AED
urgent~adult-choking~成人气道异物~能咳嗽发声与完全不能呼吸的处理不同~有效咳嗽时鼓励咳嗽，严重阻塞需按当地急救流程~无法说话咳嗽或呼吸时立即求助并实施急救~意识丧失后开始复苏且每次开放气道检查可见异物~nhsFirstAid~urgent~窒息；急救
urgent~anaphylaxis-epinephrine~严重过敏~严重过敏可迅速影响气道、呼吸或循环~皮肤症状可能缺席，不应等待全身风团才行动~按个人计划立即使用肾上腺素自动注射器并呼叫急救~喉咙紧、喘鸣、晕厥、反复呕吐或多系统症状~nhsFirstAid~urgent~过敏；肾上腺素
urgent~severe-asthma~重度哮喘发作~说话困难和吸入药效果差提示危险~峰流量仅是辅助，严重症状不能为测量而延误~坐直并按个人急救方案使用缓解药、呼叫急救~发绀、嗜睡、静默胸或不能完整说句子~nhsFirstAid~urgent~哮喘；呼吸
urgent~sepsis-deterioration~脓毒症恶化~感染者快速变差可能比体温数值更重要~意识、呼吸、皮肤灌注和尿量可提示器官受影响~明确告诉急救人员症状变化速度和近期感染~意识混乱、呼吸急促、皮肤花斑、极度虚弱或少尿~nhsFirstAid~urgent~感染；急症
urgent~massive-bleeding-pressure~严重出血~持续直接压迫是控制外出血的核心步骤~频繁掀开查看会破坏已形成的凝血，嵌入物不应拔出~戴防护后用敷料持续加压并呼叫急救~喷射出血、浸透多层敷料、休克表现或截肢~nhsFirstAid~urgent~出血；急救
urgent~major-burn~严重烧伤~烧伤深度和部位比疼痛强度更能决定风险~深部神经受损时反而可能不太痛，电烧伤外表也可很小~脱离热源、凉水降温并松散覆盖后呼叫急救~面颈手会阴、大面积、环形、电化学或吸入伤~nhsFirstAid~urgent~烧伤；急救
urgent~poison-exposure~中毒暴露~不同毒物的催吐、饮水和活性炭建议并不相同~盲目催吐可能造成再次灼伤或吸入~移离持续暴露并携带包装联系当地毒物或急救中心~意识下降、抽搐、呼吸困难或腐蚀品接触~nhsFirstAid~urgent~中毒；急救
urgent~carbon-monoxide~一氧化碳~一氧化碳无色无味，可让同一空间多人头痛恶心~普通血氧仪可能显示看似正常，不能排除~立即到新鲜空气处并呼叫急救和消防检查源头~意识改变、胸痛、孕妇暴露或多人同时不适~nhsFirstAid~urgent~环境；中毒
urgent~heat-stroke~热射病~热射病的核心是高热暴露伴中枢神经异常~出汗是否存在不能可靠排除，延迟降温会增加器官损伤~呼叫急救并立即用冷水、冰水浸泡或可用最快方式降温~意识混乱、抽搐、昏迷或高温环境下行为异常~nhsFirstAid~urgent~高温；急救
urgent~hypothermia-gentle~低体温~低体温会影响判断、协调和心律~剧烈揉搓和快速加热四肢可能不安全~移到避风处、脱湿衣、包裹躯干并呼叫急救~嗜睡、言语不清、停止发抖、呼吸慢或意识下降~nhsFirstAid~urgent~寒冷；急救
urgent~drowning-aftercare~溺水~离水后看似恢复仍可能存在呼吸系统问题~是否咳出水不应决定是否复苏，也不要倒挂排水~确保自身安全后呼叫救援，无正常呼吸即开始复苏~持续咳喘、发绀、意识改变、胸痛或疲惫异常~nhsFirstAid~urgent~水上；复苏
urgent~head-injury-observe~头部损伤~头部外伤后的危险表现可延迟出现~抗凝药、年龄、失忆和高能量机制会降低评估阈值~记录受伤时间和意识变化，避免独自留置~反复呕吐、嗜睡加重、抽搐、瞳孔不等或神经症状~nhsFirstAid~urgent~头部；观察
urgent~spinal-precaution~疑似脊柱损伤~高能量外伤伴颈背痛或神经症状需减少不必要移动~保持气道和生命优先，不能为了固定姿势牺牲呼吸~呼叫急救并让伤者保持尽可能静止~麻木无力、大小便失控、呼吸困难或明显畸形~nhsFirstAid~urgent~脊柱；急救
urgent~seizure-first-aid~癫痫发作~大多数抽搐发作会自行停止，强行按压或塞物入口会伤人~保护头部、移开危险物并计时更重要~发作结束后侧卧并观察呼吸、呼叫需要的帮助~持续五分钟、连续发作、首次发作、孕期或受伤~nhsFirstAid~urgent~癫痫；急救
urgent~severe-hypoglycemia~严重低血糖~意识受损时口服食物会造成误吸~有个人胰高血糖素方案时旁人可按训练使用~侧卧、呼叫急救并按个人计划使用胰高血糖素~不能吞咽、抽搐、昏迷或快速糖处理后不恢复~nhsFirstAid~urgent~低血糖；急救
urgent~opioid-overdose~阿片类过量~呼吸慢、针尖样瞳孔和难以唤醒提示阿片过量~纳洛酮作用可能短于阿片，恢复后仍需急救观察~呼叫急救、给予可用纳洛酮并支持呼吸~无正常呼吸、发绀、再次嗜睡或混合药物暴露~nhsFirstAid~urgent~过量；纳洛酮
urgent~suicide-immediate~自杀危机~明确计划和可及手段意味着需要立即保护~不要把保密承诺置于生命安全之上，也不要让当事人独处~陪伴、移开可安全移除的手段并联系当地急救或危机服务~正在实施、已服药、自伤出血或无法保证短期安全~nimhMental~urgent~心理；危机
urgent~ectopic-pregnancy~异位妊娠警示~妊娠早期腹痛出血可能包括异位妊娠~肩痛、晕厥和休克可提示腹腔出血，验孕阴性过早也可能误导~有妊娠可能时说明末次月经和症状并立即评估~单侧剧痛、肩痛、晕厥、苍白冷汗或大量出血~nhsFirstAid~urgent~妊娠；急症
urgent~postpartum-hemorrhage~产后大出血~产后异常大量出血可在分娩后立即或稍后发生~浸透卫生用品的速度、血块、头晕和心率都比主观量多更有帮助~立即呼叫产科急救并平卧保暖、不要独自等待~快速浸透、巨大血块、晕厥、气促或意识改变~nhsFirstAid~urgent~产后；出血
urgent~child-breathing~儿童呼吸困难~胸壁凹陷、呻吟和无法进食可提示儿童呼吸负担~儿童可在疲劳后突然恶化，只有咳嗽声大不代表更严重~保持舒适体位并立即联系儿科急救~发绀、嗜睡、暂停呼吸、流涎不能吞咽或严重凹陷~nhsFirstAid~urgent~儿童；呼吸
urgent~chemical-eye~眼部化学暴露~眼部化学品接触需要立即持续冲洗~等待寻找中和剂或先做视力测试会浪费时间~取下可轻易移除的隐形眼镜，用清水持续冲洗并求助~强酸碱、持续疼痛、视力变化或角膜浑浊~nhsFirstAid~urgent~眼睛；化学品
urgent~tooth-avulsion~恒牙脱落~外伤脱落的恒牙尽快复位或合适保存可提高存活机会~只拿牙冠、不刷洗牙根，乳牙不应自行塞回~轻柔冲洗后尝试复位或置于牛奶并立即找急诊牙科~大量出血、颌骨损伤、意识异常或吸入牙齿~nhsFirstAid~urgent~牙齿；外伤
environment~aqi-activity~空气质量~空气质量指数把污染浓度转为健康提示，但各地分级可能不同~同一指数对儿童、孕妇和心肺病患者的意义更大~查看当地实时指数并把高强度活动移到污染较低时段~严重喘息、胸痛、发绀或呼吸困难~cdcEnvironment~caution~空气；活动
environment~heat-plan~高温计划~高温风险来自温度、湿度、暴晒、药物和身体适应共同作用~最初几天和夜间不降温时风险更高~提前安排凉爽地点、饮水、同伴检查和工作休息~意识异常、晕厥、无法降温或热环境下抽搐~cdcEnvironment~urgent~高温；计划
environment~cold-wind~寒冷与风~风会加速裸露皮肤散热，湿衣物进一步增加风险~体感温度比气温更能提示冻伤暴露速度~分层穿衣、保持干燥并覆盖末梢和面部~皮肤蜡白麻木、停止发抖、言语不清或嗜睡~cdcEnvironment~caution~寒冷；天气
environment~altitude-ascent~高海拔~高原反应风险与上升速度密切相关，体能好也不能免疫~头痛伴恶心、睡眠差是常见表现，继续上升可能恶化~分阶段上升并在症状出现时停止继续爬升~静息气促、步态不稳、意识变化或粉红泡沫痰~cdcTravel~urgent~高原；旅行
environment~sun-reflection~反射紫外线~雪、水和沙会反射紫外线，阴凉感不等于低暴露~高海拔和接近赤道也会增加暴露强度~结合衣物、帽子、眼镜和足量防晒~雪盲样眼痛畏光、严重晒伤或热病~cdcTravel~caution~紫外线；环境
environment~travel-hydration~旅行补水~飞行干燥感不等于每个人都需强迫大量饮水~酒精、咖啡因、腹泻、心肾病和活动量会改变需求~按口渴和尿量分次饮水，长途移动时规律活动~无尿、持续呕吐、意识变化或快速水肿~cdcTravel~caution~旅行；饮水
environment~repellent-label~驱蚊剂~有效驱避剂需按活性成分浓度和标签正确使用~天然气味并不自动等于有效或低过敏~先涂防晒再按标签涂驱避剂，回室内后清洗~眼口误入、严重皮疹、呼吸困难或儿童误食~cdcTravel~caution~昆虫；标签
environment~traveler-diarrhea~旅行者腹泻~食品与水卫生可降低风险，但无法消除所有旅行者腹泻~补液是核心，抗生素和止泻药适应证取决于严重度和地区~携带口服补液盐并记录次数、发热和血便~严重脱水、血便、高热、持续呕吐或孕幼老高风险~cdcTravel~caution~旅行；消化
environment~safe-water~旅行饮水~清澈的水也可能含病原体~煮沸、合规过滤和化学消毒对不同病原体效果不同~在风险地区使用密封瓶装或按指南处理的水刷牙制冰~洪灾污染、化学污染或多人同时发病~cdcTravel~caution~水；感染
environment~medication-travel~旅行携药~跨境携药需要同时考虑稳定性、数量和当地法规~分装无标签药片可能在安检和急诊时造成困难~保留原包装、处方证明和随身备用量~温控药失效、管制药法规不清或行程中断导致断药~cdcTravel~caution~旅行；用药
environment~insurance-evacuation~医疗后送~普通旅行保险未必覆盖偏远地区后送和既往疾病~只有保单明确写出的保障才可依赖~核对医疗、后送、活动排除条款并离线保存号码~保险确认不能成为延误急救的理由~cdcTravel~general~保险；风险
environment~flight-mobility~长途移动~长时间静止会增加静脉血栓风险，高风险者需个别计划~脱水感并非唯一原因，随意服阿司匹林也不是通用预防~定期活动小腿和走动，高风险者行前咨询~单侧腿肿痛、胸痛、咯血或突发气促~cdcTravel~urgent~交通；血栓
environment~motion-sickness~晕动病~视觉与前庭信息不一致会触发晕动症状~座位、视线、阅读和药物镇静副作用影响体验~看远方、保持通风并在行前核对药物~持续呕吐脱水、神经症状或症状不随移动停止~cdcTravel~caution~旅行；感官
environment~occupational-noise~职业噪声~噪声性听力损失通常不可逆但可预防~护听器必须匹配声级、佩戴和沟通需求~参加听力监测并学习正确密合护具~爆炸声后突聋、耳流血或严重眩晕~cdcHearing~caution~职业；听力
environment~work-variation~工效学~减少重复和持续负荷比寻找完美姿势更现实~任务轮换、工具高度和恢复时间共同影响肌肉骨骼负担~每小时改变动作模式并报告早期麻木无力~进行性神经症状、外伤或无法安全完成任务~cdcEnvironment~caution~职业；姿势
environment~shift-fatigue~轮班疲劳~夜班会同时影响睡眠、注意和代谢行为~咖啡因只能短暂提高警觉，不能替代恢复睡眠~安排班前短睡、亮光和安全下班交通~驾驶或操作设备时无法保持清醒~cdcEnvironment~urgent~职业；睡眠
environment~chemical-sds~化学品安全数据~安全数据表说明危害、储存、防护和急救，但需对应具体产品~相似商品名不代表成分相同~使用前查标签和SDS并准备泄漏处理~吸入困难、化学烧伤、意识改变或大面积泄漏~cdcEnvironment~urgent~职业；化学品
environment~respirator-fit~呼吸防护~过滤材料合格仍需正确密合才能提供预期保护~胡须、脸型和错误滤盒会造成泄漏，医用口罩不能替代所有呼吸器~按职业规范做密合测试并检查滤盒期限~缺氧环境、未知浓度或使用中头晕气促~cdcEnvironment~caution~职业；呼吸
environment~indoor-co~室内燃烧~燃气、炭火和发动机在通风不良处可产生一氧化碳~没有烟味也可能危险，报警器位置与维护很关键~卧室附近安装合规报警器并定期测试~多人头痛恶心、报警响或意识异常立即撤离~cdcEnvironment~urgent~家庭；中毒
environment~mold-moisture~霉菌与潮湿~控制潮湿源比单纯喷香味剂更重要~漏水、冷凝和通风不足会让霉菌反复，颜色不能判断毒性~修复水源并在安全条件下清理小面积污染~洪水污水、大面积霉变或严重哮喘免疫抑制者暴露~cdcEnvironment~caution~住房；呼吸
environment~radon-test~氡~氡无色无味，长期暴露增加肺癌风险~邻居检测结果不能替代自己住所，楼层和建筑也会影响~使用合规长期或短期检测并按结果采取缓解~检测本身不是急症，但高值应由专业方案处理~cdcEnvironment~general~住房；预防
environment~wildfire-smoke~野火烟霾~细颗粒可远距离传播并进入室内~普通布口罩不能提供同等颗粒防护，室内净化效果受房间和滤器影响~关闭渗漏、建立清洁空气房并减少户外强活动~胸痛、严重喘息、发绀或意识改变~cdcEnvironment~urgent~烟霾；空气
environment~disaster-kit~灾害准备~应急包要围绕本地风险和家庭成员需求~药物、饮水、照明、通信和证件副本比统一商品套装更关键~每半年检查期限并为儿童宠物和慢病准备专用品~灾害发生时遵循官方撤离，不为取物返回危险区~cdcEnvironment~general~灾害；准备
environment~climate-distress~气候压力~灾害与长期环境变化可引发焦虑、哀伤和无力感~把情绪视为可理解反应，不等于忽略实际风险~限制无休止信息摄入并参与可控的社区准备~持续失眠抑郁、自伤想法或灾后功能明显受损~nimhMental~caution~环境；心理
environment~travel-source-time~实时旅行信息~天气、安全、签证和开放时间都可能快速变化~静态攻略不能替代出发前的官方实时查询~保存查询时间并在出发前和当天再次核对~当地官方撤离、极端天气或安全警报优先~cdcTravel~general~旅行；信息
prevention~screening-personalized~筛查决策~筛查收益取决于年龄、风险、时间范围和后续处理意愿~同一检查不适合所有人，推荐也会随证据更新~依据个人风险与偏好讨论是否、何时和多频繁筛查~出现症状时走诊断路径而不是等待筛查~uspstf~general~筛查；决策
prevention~lead-time-bias~领先时间偏倚~更早发现可让确诊后生存时间看似变长，即使死亡时间未改变~只看五年生存率可能夸大筛查价值~关注疾病死亡率、绝对风险和随机对照证据~该概念不能用来否认已证明获益的筛查~nciPrevention~general~筛查；统计
prevention~overdiagnosis~过度诊断~筛查可能发现一生不会造成伤害的病变~这不同于误诊，病变真实存在但其自然史缓慢~讨论每千人获益、假阳性和过度诊断估计~异常结果需按规范确认，不能自行忽略~nciPrevention~general~筛查；权衡
prevention~false-positive-anxiety~筛查假阳性~筛查异常不等于确诊，却可能带来复查与焦虑~低风险人群中阳性预测值可能不高~在检测前了解后续确认路径和可能等待时间~危险症状不能被既往阴性筛查解释掉~uspstf~general~筛查；概率
prevention~cervical-screening~宫颈癌筛查~HPV检测和细胞学用于发现高风险感染或癌前变化~起始年龄和间隔依当地指南、既往结果和免疫状态~保存结果与治疗史并按当地建议复查~异常出血、性交后出血或盆腔痛需诊断评估~uspstf~caution~筛查；女性健康
prevention~breast-screening~乳腺筛查~乳腺X线筛查的获益与假阳性会随年龄和风险变化~致密乳腺影响检测表现，补充影像也有额外假阳性~结合年龄、家族史和偏好讨论时间表~新肿块、血性溢液或皮肤凹陷需及时诊断~uspstf~caution~筛查；乳腺
prevention~colorectal-options~结直肠癌筛查~粪便检测、内镜和其他方法在频率与后续步骤上不同~选择能按时完成且阳性后愿意做结肠镜的方法更实际~按风险选择方案并确保阳性结果完成诊断~便血黑便、贫血、排便改变或体重下降需评估~uspstf~caution~筛查；消化
prevention~lung-screening-risk~肺癌筛查~低剂量CT只对特定吸烟风险人群证明净获益~普通胸片不能替代，筛查也不是无风险的全民检查~准确计算吸烟包年并讨论戒烟与筛查资格~咯血、持续咳嗽、胸痛或体重下降走诊断路径~uspstf~caution~筛查；肺部
prevention~prostate-decision~前列腺筛查~PSA可能发现有意义肿瘤，也会带来过度诊断和治疗副作用~年龄、家族史、族群风险和个人价值影响选择~检测前先讨论可能的MRI、活检与观察路径~尿潴留、血尿、骨痛等症状需单独评估~uspstf~general~筛查；男性健康
prevention~skin-risk-check~皮肤癌预防~高风险者专业检查与日常防晒各有角色~没有统一证据支持所有无症状人群以相同频率全身筛查~按暴露、肤色、既往病史和免疫状态决定检查~快速变化、出血或久不愈合皮损及时评估~nciPrevention~caution~皮肤；预防
prevention~oral-cancer-risk~口腔癌风险~烟草、酒精和部分HPV相关因素会增加口咽癌风险~普通口腔溃疡常见，但持续时间和触感变化重要~戒烟限酒并定期口腔检查~溃疡肿块超过两周、吞咽困难或颈部肿块~nciPrevention~caution~口腔；癌症
prevention~hpv-vaccine-cancer~HPV疫苗~HPV疫苗通过预防高风险感染降低多种癌症风险~它不能治疗已有感染，也不取代宫颈筛查~按年龄和免疫状态完成推荐剂次~严重过敏史需接种前说明，接种后急性过敏需急救~cdcVaccines~general~疫苗；癌症预防
prevention~hbv-vaccine-liver~乙肝预防~乙肝疫苗和感染检测共同支持肝癌预防~已感染者接种不能清除病毒，但规范随访可降低并发症~核对接种记录和风险，必要时检测感染状态~黄疸、呕血、意识变化或暴露后时间敏感处理~cdcVaccines~caution~疫苗；肝脏
prevention~tobacco-cancer~烟草与癌症~燃烧烟草影响不止肺癌，还关联多种器官癌症~减少量可能是过程，但完全停止带来更大风险下降~结合药物和行为支持制定戒烟计划~咯血、持续胸痛、声音嘶哑或非自愿体重下降~nciPrevention~caution~烟草；癌症预防
prevention~alcohol-cancer~酒精与癌症~癌症风险会随酒精摄入增加，酒类类型不能消除乙醇风险~所谓心血管获益不能当作开始饮酒的理由~了解实际单位并安排减少或无酒精选择~严重戒断风险者不要突然独自停酒~nciPrevention~caution~酒精；癌症预防
prevention~weight-risk-context~体重与癌症风险~体脂、代谢和激素路径与多种癌症风险相关~体重不是个人价值，单次数字也不能说明全部风险~以活动、饮食、睡眠等可执行行为为重点~快速非自愿体重下降或持续食欲变化需评估~nciPrevention~general~代谢；预防
prevention~activity-cancer~活动与癌症预防~规律身体活动与部分癌症较低风险相关~收益来自长期习惯，不要求达到竞技强度~从每周可持续的快走和力量训练累积~癌症治疗中运动需根据贫血、骨转移和感染风险调整~nciPrevention~general~运动；预防
prevention~family-history~家族史~发病年龄和亲属关系比仅说家里有人得癌更有信息~父母双方家系都重要，信息会随新诊断更新~绘制三代家族病史并记录癌种与年龄~明显聚集或早发病例可转遗传咨询~nciPrevention~general~遗传；记录
prevention~genetic-counseling~遗传咨询~遗传检测前咨询有助理解结果可能为阳性、阴性或意义不明~检测可能影响亲属，也涉及隐私和保险情境~先明确检测问题、结果行动和信息分享选择~不要仅凭消费级结果决定手术或停筛查~nciPrevention~caution~遗传；决策
prevention~symptoms-not-screening~症状与筛查~出现症状后即使年龄未到筛查标准也需要诊断评估~筛查标准是无症状人群的平衡，不是拒绝症状检查的门槛~清楚描述起点、变化和功能影响~出血、肿块、持续疼痛或快速体重下降~nciPrevention~caution~症状；诊断
prevention~vaccines-prevention~成人疫苗~疫苗接种是跨年龄预防的一部分，不只属于儿童~流感、肺炎球菌、带状疱疹等建议随年龄风险变化~每年核对一次成人接种记录~暴露后预防和高风险免疫抑制需个别方案~cdcVaccines~general~疫苗；生命周期
prevention~dental-prevention~口腔预防~龋病和牙周病可通过日常清洁、氟化物和专业照护降低风险~刷牙出血不是停止清洁的理由，也可能提示炎症~每天含氟牙膏刷牙并清洁牙缝~面部肿胀、发热、吞咽困难或牙外伤~medline~caution~口腔；预防
prevention~eye-prevention~视力预防~眼病风险与年龄、糖尿病、家族史和用药相关~看得清不代表没有早期青光眼或糖尿病视网膜病变~按风险安排散瞳检查并保护眼睛免受紫外线和外伤~突然视力下降、黑幕、眼痛或闪光飞蚊急增~neiEye~caution~视力；筛查
prevention~bp-screening~血压筛查~高血压常无症状，规范测量才能识别~一次异常可能受紧张和技术影响，通常需重复确认~用合格设备多日记录并由专业人员解释~极高血压伴胸痛、神经症状或呼吸困难~uspstf~caution~血压；筛查
prevention~diabetes-screening~糖尿病筛查~筛查时点应结合年龄、体重、妊娠史和其他风险~空腹血糖、糖化血红蛋白和糖耐量各有局限~按风险选择检测并确认异常结果~典型高血糖症状、妊娠或急性病需及时评估~uspstf~caution~糖代谢；筛查
lifespan~folic-acid~孕前叶酸~神经管在妊娠很早期形成，叶酸需在受孕前后及时获得~高风险人群剂量不同，普通复合维生素也需核对维生素A形式~备孕前与专业人员确认叶酸和全部药物~既往神经管缺陷妊娠或使用特定抗癫痫药需个别方案~whoLifespan~caution~孕前；营养
lifespan~pregnancy-warning~孕期警示~孕期严重头痛、视物异常和上腹痛可能提示高血压疾病~水肿本身常见，但与血压及神经症状组合更重要~保存产检联系渠道并了解急诊入口~出血、抽搐、胸痛气促、胎动明显减少或持续剧痛~whoLifespan~urgent~孕期；急症
lifespan~prenatal-continuity~产前照护~连续产检用于监测孕妇与胎儿变化，而不只是做超声~血压、感染、糖代谢、心理和社会支持都属于照护~携带既往病史和用药清单按计划随访~无法获得照护、严重症状或家庭暴力需及时求助~whoLifespan~caution~孕期；照护
lifespan~breastfeeding-support~母乳喂养~母乳喂养是需要学习和支持的技能，不应成为道德考试~疼痛、含接、供给和家庭选择需个别处理，配方奶也应安全制备~尽早获得喂养观察并关注婴儿尿量和体重~婴儿嗜睡不进食、脱水、母亲高热乳房红痛或严重情绪危机~whoLifespan~caution~婴儿；喂养
lifespan~infant-safe-sleep~婴儿安全睡眠~仰卧、平坦坚实且无松软物的独立睡眠面可降低风险~沙发、扶手椅和成人床缝隙尤其危险~每次睡眠都把婴儿仰卧放在合规睡眠空间~呼吸异常、发绀、难唤醒或体温异常~whoLifespan~urgent~婴儿；安全
lifespan~newborn-fever~新生儿发热~幼小婴儿发热可能是严重感染的唯一早期表现~不同测温方式阈值不同，精神状态正常也不能完全放心~准确记录体温方式和时间并立即联系儿科~三个月以下发热、拒奶、嗜睡、呼吸异常或皮疹~medline~urgent~婴儿；感染
lifespan~development-variation~儿童发育~发育存在范围，但持续失去已获得技能尤其重要~单一里程碑晚一点与多领域持续差距不同~在日常玩耍中记录语言、动作和互动并定期筛查~技能倒退、抽搐、吞咽呼吸问题或明显无反应~whoLifespan~caution~儿童；发育
lifespan~child-fever-comfort~儿童发热照护~退热目标是改善舒适和饮水，不是追求体温数字完全正常~药物需按体重和成分计算，交替用药容易混淆~提供液体、轻薄衣物并记录剂量时间~呼吸困难、颈强直、紫斑、嗜睡或明显脱水~medline~urgent~儿童；发热
lifespan~teen-sleep~青少年睡眠~青少年节律后移与早起上学容易造成长期睡眠不足~周末大幅晚睡晚起会加重周一社会时差~稳定起床时间并把晚间作业和设备设置结束点~驾驶嗜睡、严重抑郁、自伤或数日少睡不困~nhlbiSleep~caution~青少年；睡眠
lifespan~puberty-variation~青春期~青春期开始和速度存在较大个体差异~生长、遗传、营养和疾病都会影响时点，不能仅与同龄比较~用尊重隐私的方式记录变化并按常规体检讨论~明显过早过晚、剧烈疼痛、进食问题或心理危机~whoLifespan~general~青春期；发育
lifespan~contraception-fit~避孕选择~避孕方法在有效性、可逆性、出血和隐私上各有权衡~理论有效率与现实中能否持续正确使用不同~根据健康、偏好和生育计划比较方案~胸痛、单腿肿、严重头痛神经症状或妊娠疑虑~whoLifespan~caution~生殖；决策
lifespan~sti-window~性传播感染检测~检测窗口期和采样部位取决于感染与暴露方式~没有症状不能排除，单一部位检测也可能遗漏~坦诚说明暴露时间与部位以选择检测~暴露后预防有时间窗，盆腔痛发热或睾丸剧痛需急诊~cdcInfection~caution~性健康；检测
lifespan~menopause-bleeding~绝经后出血~绝经后任何阴道出血都应评估~原因可能良性，也可能需要及时排除内膜病变~记录出血量、持续时间和激素用药~大量出血、晕厥、胸痛气促或剧烈腹痛~whoLifespan~urgent~更年期；警示
lifespan~menopause-options~更年期症状~潮热、睡眠、情绪和泌尿生殖症状的组合因人而异~激素与非激素方案需结合血栓、癌症和个人偏好~记录最影响功能的症状并讨论多种选择~绝经后出血、神经症状或严重抑郁不是普通潮热~whoLifespan~caution~更年期；决策
lifespan~pelvic-floor~盆底健康~漏尿和盆腔器官脱垂常见但并非只能忍受~咳嗽、分娩、便秘和负荷会影响症状，训练需正确收缩和放松~由受训人员评估后练习并处理便秘咳嗽~无法排尿、剧烈盆痛、出血或组织嵌顿~medline~caution~盆底；功能
lifespan~fertility-age~生育力与年龄~生育力随年龄变化，但个体不能由年龄单独预测~精子、排卵、输卵管和整体健康都可能影响~依据尝试时长和年龄及时咨询，而非只依赖家庭试纸~剧烈腹痛、妊娠出血或治疗后卵巢过度刺激症状~whoLifespan~caution~生殖；时间
lifespan~postpartum-mental~产后心理健康~产后抑郁和焦虑可影响任何照护者，不等于不爱孩子~短暂情绪波动与持续功能受损需要区分~尽早告诉家人和产科儿科团队并安排实际休息支持~自伤或伤婴想法、精神病性症状、极度混乱或数日不睡~nimhMental~urgent~产后；心理
lifespan~pregnancy-vaccines~孕期疫苗~部分孕期疫苗可同时保护孕妇和新生儿~活疫苗与非活疫苗处理不同，接种时点依当地建议~把孕周和接种记录交给产检人员核对~暴露后和严重过敏史需个别评估~cdcVaccines~general~孕期；疫苗
lifespan~older-strength~老年力量~年龄增长不取消肌肉对抗阻训练的适应能力~从坐站、提物和台阶等功能动作开始可直接连接日常生活~每周规律练习并逐步增加阻力~胸痛晕厥、近期骨折或功能突然下降~niaOlder~caution~老龄；力量
lifespan~fall-review~跌倒复盘~跌倒通常由视力、药物、血压、环境和力量多因素共同造成~只清除地毯可能遗漏核心原因~记录时间地点和前兆，复核药物、视力和步态~头部外伤、无法负重、晕厥或反复无预兆跌倒~niaOlder~caution~老龄；跌倒
lifespan~delirium-acute~谵妄~数小时到数天波动的注意和意识改变不同于慢性痴呆~感染、药物、脱水和器官疾病常是诱因~带上用药和最后正常时间立即评估~突然混乱本身就是急症，尤其伴发热、无力或呼吸困难~niaOlder~urgent~老龄；意识
lifespan~dementia-function~认知变化~痴呆评估关注认知变化是否影响独立功能~抑郁、听力、药物、睡眠和甲状腺问题可模拟或加重~收集账单、用药、导航等具体变化并由熟悉者补充~突然变化、单侧无力、语言障碍或走失危险~niaBrain~caution~认知；功能
lifespan~hearing-cognition~听力与老龄~听力下降会增加沟通负担并可能被误认为认知问题~助听设备需要适配、训练和维护，不是戴上即完成~先做听力评估并在交流中面对面、减少背景噪声~单侧突聋、眩晕、神经症状或耳流血~niaOlder~caution~听力；认知
lifespan~polypharmacy-goals~多重用药~药物数量多可能合理，但每一种都应有当前目标~重复成分、相互作用和服用困难随数量增加~定期逐项核对用途、净获益和停药计划~不要自行骤停；跌倒、出血、谵妄或低血糖需评估~niaOlder~caution~老龄；用药
lifespan~advance-care-planning~预先照护计划~预先照护计划是在仍能表达时讨论价值和代理人~它不只是拒绝抢救，也包括希望接受的治疗与生活目标~指定代理人并把文件交给家人和医疗机构~急症时先提供必要救治，同时查找有效文件和代理人~niaOlder~general~老龄；决策
`, MEDICAL_FIELDS, "medical");

module.exports = {
  CITY_EXTENSION_ROWS,
  GERMAN_EXTENSION_ROWS,
  MEDICAL_EXTENSION_ROWS,
  MEDICAL_SOURCES,
  MEDICAL_SOURCE_OVERRIDES,
  MEDICAL_SOURCE_ACCESSED_AT_OVERRIDES,
  MEDICAL_RISK_OVERRIDES,
  MEDICAL_SERVICE_URGENT_SLUGS,
  MEDICAL_CONTENT_OVERRIDES,
  rows
};
