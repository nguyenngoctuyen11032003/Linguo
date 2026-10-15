// Spec 8.2 #6: the fixed catalog of AI role-play scenarios. The `roleplay_turn` request carries only a scenario
// key; the Edge Function takes the partner persona and the goals FROM THIS FILE, never from client text (prompt
// injection hardening), and the web app renders the same titles and goals.
// This file is copied verbatim into supabase/functions/_shared/roleplay-catalog.ts by
// scripts/sync-ai-contract.mjs (CI runs --check), so it must not import anything.

export type RoleplayLanguage = 'en' | 'ko' | 'ja';

export interface RoleplayGoal {
  /** snake_case key; the model reports reached goals by these keys only. */
  key: string;
  label_vi: string;
}

export interface RoleplayScenario {
  key: string;
  language: RoleplayLanguage;
  title_vi: string;
  summary_vi: string;
  /** Short label shown to the learner, e.g. "Nhân viên quán cà phê". */
  partner_role_vi: string;
  /** Trusted persona text for the system prompt (Vietnamese; the model speaks the target language). */
  persona: string;
  goals: readonly RoleplayGoal[];
  /** Lowest and highest level code (see ROLEPLAY_LEVELS) the scenario suits. */
  level_min: string;
  level_max: string;
  /** Example of a natural opening line, in the target language (a style hint, never shown as a rule). */
  opening_hint: string;
}

export const ROLEPLAY_LEVELS: Record<RoleplayLanguage, readonly string[]> = {
  en: ['pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'],
  ko: ['hangul', 'topik1', 'topik2', 'topik3', 'topik4', 'topik5', 'topik6'],
  ja: ['kana', 'n5', 'n4', 'n3', 'n2', 'n1'],
};

const g = (key: string, label_vi: string): RoleplayGoal => ({ key, label_vi });

export const ROLEPLAY_SCENARIOS: readonly RoleplayScenario[] = [
  // English
  {
    key: 'cafe_order',
    language: 'en',
    title_vi: 'Gọi đồ ở quán cà phê',
    summary_vi: 'Chọn đồ uống, món ăn kèm và thanh toán.',
    partner_role_vi: 'Nhân viên quán cà phê',
    persona: 'Bạn là nhân viên thân thiện ở quầy một quán cà phê nhỏ. Bạn nhận order đồ uống và bánh, hỏi cỡ ly, uống tại chỗ hay mang đi, rồi báo giá.',
    goals: [g('order_drink', 'Gọi một đồ uống'), g('choose_size_or_extras', 'Chọn cỡ ly hoặc món kèm'), g('pay', 'Hỏi giá và thanh toán')],
    level_min: 'pre_a1',
    level_max: 'b1',
    opening_hint: 'Hi! Welcome to Sunny Café. What can I get for you today?',
  },
  {
    key: 'ask_directions',
    language: 'en',
    title_vi: 'Hỏi đường',
    summary_vi: 'Hỏi và hiểu cách đi đến một địa điểm.',
    partner_role_vi: 'Người dân địa phương',
    persona: 'Bạn là một người dân địa phương tốt bụng đang đứng ở ngã tư gần ga tàu. Bạn chỉ đường ngắn gọn bằng các mốc dễ thấy (rẽ trái, rẽ phải, đi thẳng, đối diện, bên cạnh).',
    goals: [g('ask_place', 'Hỏi đường đến một nơi'), g('confirm_route', 'Nhắc lại để chắc mình hiểu'), g('thank', 'Cảm ơn và chào tạm biệt')],
    level_min: 'a1',
    level_max: 'b1',
    opening_hint: 'Excuse me, you look a little lost. Can I help you find something?',
  },
  {
    key: 'hotel_checkin',
    language: 'en',
    title_vi: 'Nhận phòng khách sạn',
    summary_vi: 'Xác nhận đặt phòng, hỏi giờ ăn sáng và wifi.',
    partner_role_vi: 'Lễ tân khách sạn',
    persona: 'Bạn là lễ tân lịch sự của một khách sạn tầm trung. Bạn xác nhận tên khách và số đêm, nhắc giờ trả phòng, và trả lời câu hỏi về bữa sáng, wifi.',
    goals: [g('confirm_booking', 'Xác nhận đặt phòng'), g('ask_facilities', 'Hỏi về bữa sáng hoặc wifi'), g('special_request', 'Nêu một yêu cầu thêm')],
    level_min: 'a2',
    level_max: 'b2',
    opening_hint: 'Good evening, welcome to the Harbor Hotel. Do you have a reservation?',
  },
  {
    key: 'doctor_visit',
    language: 'en',
    title_vi: 'Đi khám bác sĩ',
    summary_vi: 'Mô tả triệu chứng và nghe lời dặn của bác sĩ.',
    partner_role_vi: 'Bác sĩ đa khoa',
    persona:
      'Bạn là bác sĩ đa khoa điềm đạm. Bạn hỏi người bệnh triệu chứng nhẹ thường gặp (đau đầu, cảm, đau họng), hỏi từ bao giờ, rồi dặn nghỉ ngơi và uống thuốc. Không chẩn đoán bệnh nặng, không kê thuốc cụ thể thật; đây chỉ là tình huống luyện nói.',
    goals: [g('describe_symptoms', 'Mô tả triệu chứng'), g('say_duration', 'Nói triệu chứng kéo dài bao lâu'), g('understand_advice', 'Hiểu lời dặn của bác sĩ')],
    level_min: 'a2',
    level_max: 'b2',
    opening_hint: 'Hello, please have a seat. What seems to be the problem today?',
  },
  {
    key: 'job_interview',
    language: 'en',
    title_vi: 'Phỏng vấn xin việc cơ bản',
    summary_vi: 'Giới thiệu bản thân, kinh nghiệm và điểm mạnh.',
    partner_role_vi: 'Nhà tuyển dụng',
    persona:
      'Bạn là nhà tuyển dụng lịch sự trong buổi phỏng vấn đầu cho vị trí nhân viên văn phòng. Bạn hỏi lần lượt: giới thiệu bản thân, kinh nghiệm, một điểm mạnh, vì sao muốn làm vị trí này. Mỗi lần chỉ hỏi một câu.',
    goals: [g('introduce_self', 'Giới thiệu bản thân'), g('describe_experience', 'Nói về kinh nghiệm'), g('state_strength', 'Nêu một điểm mạnh')],
    level_min: 'b1',
    level_max: 'c1',
    opening_hint: 'Thanks for coming in today. Could you start by telling me a little about yourself?',
  },
  {
    key: 'shopping_bargain',
    language: 'en',
    title_vi: 'Mua sắm và trả giá',
    summary_vi: 'Hỏi giá, cỡ, màu và thương lượng nhẹ nhàng.',
    partner_role_vi: 'Người bán hàng',
    persona: 'Bạn là người bán hàng vui vẻ ở một cửa hàng quần áo nhỏ. Bạn giới thiệu sản phẩm, nói giá, và sẵn sàng giảm giá một chút nếu khách hỏi lịch sự.',
    goals: [g('ask_price', 'Hỏi giá'), g('ask_size_or_color', 'Hỏi cỡ hoặc màu'), g('bargain', 'Thương lượng giá'), g('decide', 'Quyết định mua hoặc không')],
    level_min: 'a1',
    level_max: 'b1',
    opening_hint: 'Hello! Feel free to look around. Let me know if you need any help.',
  },
  {
    key: 'introductions',
    language: 'en',
    title_vi: 'Làm quen và tự giới thiệu',
    summary_vi: 'Chào hỏi, nói tên, nơi ở và sở thích.',
    partner_role_vi: 'Một người bạn mới',
    persona:
      'Bạn là một bạn học thân thiện vừa gặp người học lần đầu ở câu lạc bộ ngoại ngữ. Bạn hỏi tên, quê quán, công việc hoặc việc học, và sở thích; bạn cũng chia sẻ vài điều ngắn về mình.',
    goals: [g('greet_and_name', 'Chào và nói tên'), g('say_origin', 'Nói mình đến từ đâu'), g('share_hobby', 'Chia sẻ một sở thích')],
    level_min: 'pre_a1',
    level_max: 'a2',
    opening_hint: "Hi there! I'm Sam. Nice to meet you. What's your name?",
  },
  // Korean
  {
    key: 'cafe_order',
    language: 'ko',
    title_vi: 'Gọi đồ ở quán cà phê',
    summary_vi: 'Chọn đồ uống, món ăn kèm và thanh toán.',
    partner_role_vi: 'Nhân viên quán cà phê',
    persona:
      'Bạn là nhân viên thân thiện ở quầy một quán cà phê Hàn Quốc. Bạn nhận order đồ uống và bánh, hỏi nóng hay lạnh, uống tại chỗ hay mang đi, rồi báo giá. Dùng lối nói lịch sự (-요 / -습니다).',
    goals: [g('order_drink', 'Gọi một đồ uống'), g('choose_size_or_extras', 'Chọn nóng/lạnh, cỡ ly hoặc món kèm'), g('pay', 'Hỏi giá và thanh toán')],
    level_min: 'topik1',
    level_max: 'topik3',
    opening_hint: '어서 오세요! 주문하시겠어요?',
  },
  {
    key: 'ask_directions',
    language: 'ko',
    title_vi: 'Hỏi đường',
    summary_vi: 'Hỏi và hiểu cách đi đến một địa điểm.',
    partner_role_vi: 'Người dân địa phương',
    persona:
      'Bạn là một người dân Seoul tốt bụng đang đứng gần lối ra ga tàu điện ngầm. Bạn chỉ đường ngắn gọn bằng mốc dễ thấy (직진, 왼쪽, 오른쪽, 건너편, 옆). Dùng lối nói lịch sự (-요).',
    goals: [g('ask_place', 'Hỏi đường đến một nơi'), g('confirm_route', 'Nhắc lại để chắc mình hiểu'), g('thank', 'Cảm ơn và chào tạm biệt')],
    level_min: 'topik1',
    level_max: 'topik3',
    opening_hint: '저기요, 길을 찾고 계세요? 도와 드릴까요?',
  },
  {
    key: 'hotel_checkin',
    language: 'ko',
    title_vi: 'Nhận phòng khách sạn',
    summary_vi: 'Xác nhận đặt phòng, hỏi giờ ăn sáng và wifi.',
    partner_role_vi: 'Lễ tân khách sạn',
    persona:
      'Bạn là lễ tân rất lịch sự của một khách sạn ở Busan. Bạn xác nhận tên khách và số đêm, nhắc giờ trả phòng, và trả lời câu hỏi về bữa sáng, wifi. Dùng lối nói kính ngữ (-습니다 / -세요).',
    goals: [g('confirm_booking', 'Xác nhận đặt phòng'), g('ask_facilities', 'Hỏi về bữa sáng hoặc wifi'), g('special_request', 'Nêu một yêu cầu thêm')],
    level_min: 'topik2',
    level_max: 'topik4',
    opening_hint: '안녕하세요, 어서 오세요. 예약하셨나요?',
  },
  {
    key: 'doctor_visit',
    language: 'ko',
    title_vi: 'Đi khám bác sĩ',
    summary_vi: 'Mô tả triệu chứng và nghe lời dặn của bác sĩ.',
    partner_role_vi: 'Bác sĩ đa khoa',
    persona:
      'Bạn là bác sĩ đa khoa điềm đạm ở một phòng khám nhỏ. Bạn hỏi người bệnh triệu chứng nhẹ thường gặp (đau đầu, cảm, đau họng), hỏi từ bao giờ, rồi dặn nghỉ ngơi và uống thuốc. Không chẩn đoán bệnh nặng, không kê thuốc cụ thể thật; đây chỉ là tình huống luyện nói. Dùng lối nói lịch sự.',
    goals: [g('describe_symptoms', 'Mô tả triệu chứng'), g('say_duration', 'Nói triệu chứng kéo dài bao lâu'), g('understand_advice', 'Hiểu lời dặn của bác sĩ')],
    level_min: 'topik2',
    level_max: 'topik4',
    opening_hint: '어서 오세요. 어디가 불편하세요?',
  },
  {
    key: 'job_interview',
    language: 'ko',
    title_vi: 'Phỏng vấn xin việc cơ bản',
    summary_vi: 'Giới thiệu bản thân, kinh nghiệm và điểm mạnh.',
    partner_role_vi: 'Nhà tuyển dụng',
    persona:
      'Bạn là nhà tuyển dụng lịch sự trong buổi phỏng vấn đầu cho vị trí nhân viên văn phòng ở một công ty Hàn Quốc. Bạn hỏi lần lượt: giới thiệu bản thân, kinh nghiệm, một điểm mạnh, vì sao muốn làm vị trí này. Mỗi lần chỉ hỏi một câu. Dùng lối nói kính ngữ (-습니다).',
    goals: [g('introduce_self', 'Giới thiệu bản thân'), g('describe_experience', 'Nói về kinh nghiệm'), g('state_strength', 'Nêu một điểm mạnh')],
    level_min: 'topik3',
    level_max: 'topik5',
    opening_hint: '안녕하세요. 먼저 간단하게 자기소개를 부탁드립니다.',
  },
  {
    key: 'shopping_bargain',
    language: 'ko',
    title_vi: 'Mua sắm và trả giá',
    summary_vi: 'Hỏi giá, cỡ, màu và thương lượng nhẹ nhàng.',
    partner_role_vi: 'Người bán hàng',
    persona:
      'Bạn là người bán hàng vui vẻ ở một cửa hàng quần áo nhỏ trong chợ. Bạn giới thiệu sản phẩm, nói giá, và sẵn sàng giảm giá một chút nếu khách hỏi lịch sự. Dùng lối nói lịch sự (-요).',
    goals: [g('ask_price', 'Hỏi giá'), g('ask_size_or_color', 'Hỏi cỡ hoặc màu'), g('bargain', 'Thương lượng giá'), g('decide', 'Quyết định mua hoặc không')],
    level_min: 'topik1',
    level_max: 'topik3',
    opening_hint: '어서 오세요! 천천히 구경하세요.',
  },
  {
    key: 'introductions',
    language: 'ko',
    title_vi: 'Làm quen và tự giới thiệu',
    summary_vi: 'Chào hỏi, nói tên, nơi ở và sở thích.',
    partner_role_vi: 'Một người bạn mới',
    persona:
      'Bạn là một bạn học người Hàn thân thiện vừa gặp người học lần đầu ở câu lạc bộ ngoại ngữ. Bạn hỏi tên, quê quán, công việc hoặc việc học, và sở thích; bạn cũng chia sẻ vài điều ngắn về mình. Dùng lối nói lịch sự (-요).',
    goals: [g('greet_and_name', 'Chào và nói tên'), g('say_origin', 'Nói mình đến từ đâu'), g('share_hobby', 'Chia sẻ một sở thích')],
    level_min: 'hangul',
    level_max: 'topik2',
    opening_hint: '안녕하세요! 만나서 반가워요. 이름이 뭐예요?',
  },
];

export function findRoleplayScenario(language: RoleplayLanguage, key: string): RoleplayScenario | undefined {
  return ROLEPLAY_SCENARIOS.find((s) => s.language === language && s.key === key);
}

export function roleplayScenariosFor(language: RoleplayLanguage): RoleplayScenario[] {
  return ROLEPLAY_SCENARIOS.filter((s) => s.language === language);
}

/** True when the level code lies in the scenario's range; an unknown level code never fits. */
export function roleplayScenarioFitsLevel(scenario: RoleplayScenario, level: string): boolean {
  const order = ROLEPLAY_LEVELS[scenario.language];
  const at = order.indexOf(level);
  return at >= 0 && at >= order.indexOf(scenario.level_min) && at <= order.indexOf(scenario.level_max);
}
