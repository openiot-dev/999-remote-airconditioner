// EventBridge 가 깨우는 배치 진입점(terraform/scheduled.tf).
//
// 규칙마다 `task` 를 입력으로 준다. 배치 종류가 늘어도 함수는 하나고, 규칙만 추가하면 된다.
// 크론이 곧 실행 시각이므로 핸들러에 "지금이 몇 시인가" 가드는 두지 않는다 —
// 진실의 원천이 둘이 되면 시각을 바꿀 때 한쪽을 빼먹는다.
//
// 배치는 사람이 안 보는 곳에서 돈다. 실패하면 조용히 사라지지 않도록:
//   · 무엇을 몇 건 처리했는지 항상 로그로 남긴다
//   · 예외는 삼키지 말고 그대로 던진다(→ Lambda Errors 알람이 울린다)
import { listByStatus } from "./domain/item/item.repository.ts";
import { dateKstOf } from "./shared/time.ts";

interface ScheduledEvent {
  task?: string;
}

/** 일 1회 작업. 여기서는 "어제까지 열려 있는 항목이 몇 건인지" 세어 로그로 남긴다.
 *  실제 툴에서는 이 자리에 집계·리마인더 발송·오래된 데이터 정리 같은 것이 들어간다. */
async function runDaily(): Promise<{ openCount: number }> {
  let openCount = 0;
  let cursor: string | undefined;

  // 페이지를 끝까지 돈다. 한 번에 다 읽으려 하면 데이터가 늘었을 때 메모리에서 터진다.
  do {
    const page = await listByStatus("open", 100, cursor);
    openCount += page.items.length;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  console.log("[daily]", { dateKst: dateKstOf(Date.now()), openCount });
  return { openCount };
}

export const handler = async (event: ScheduledEvent): Promise<unknown> => {
  const task = event?.task ?? "daily";
  console.log("[scheduled] start", { task });

  switch (task) {
    case "daily":
      return runDaily();
    default:
      // 규칙에 오타가 났거나 새 task 를 만들고 핸들러를 안 붙인 경우.
      // 조용히 성공시키면 "돌고 있는 줄 알았는데 아무 일도 안 한" 상태가 된다.
      throw new Error(`unknown scheduled task: ${task}`);
  }
};
