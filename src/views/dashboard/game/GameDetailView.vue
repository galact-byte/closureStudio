<template>
  <div class="min-h-screen flex flex-col gap-1 lg:gap-6 p-1 lg:p-6 touch-pan-y">
    <!-- 游戏选择器：桌面端保留按钮设计，移动端改为滑动切换 -->
    <div class="hidden md:block">
      <GameSelector :account="account" :game-list="gamesStore.gameList" />
    </div>

    <div v-if="gamesStore.gameList.length > 1" class="md:hidden mb-2">
      <MobileSwipeMenuHeader
        :active-title="activeGameTitle"
        :active-index="currentGameIndex"
        :items="gameSelectorItems"
        axis="x"
        swipe-text="左右滑动切换游戏"
      />
    </div>

    <!-- 顶部账号信息卡片 -->
    <GameDetailHeader :account="account" :game="selectedGame" :details="details" />

    <!-- 主内容区 - 垂直堆叠（移动端）/ 2x2 网格（桌面端） -->
    <div class="flex flex-col lg:grid lg:grid-cols-2 gap-1 lg:gap-6">
      <!-- 1. 配置卡片 -->
      <div class="s-card lg:order-1">
        <h2 class="text-xl font-bold mb-4">托管配置</h2>
        <ConfigPanel :account="account" :details="details" />
      </div>

      <!-- 2. 游戏日志卡片 -->
      <details
        :key="`logs-${account}`"
        :open="isDesktopViewport"
        class="collapse collapse-arrow s-card min-w-0 p-0! lg:order-2"
      >
        <summary class="collapse-title min-h-0 py-4! pr-12! pl-3! md:py-5! md:pl-5!">
          <h2
            class="text-xl font-bold tracking-normal after:mt-2.5 after:block after:h-0.5 after:w-5 after:bg-info after:content-['']"
          >
            游戏日志
          </h2>
        </summary>
        <div class="collapse-content px-3! pb-4! md:px-5! md:pb-5!">
          <LogsPanel
            :logs="gameLogs.logs"
            :has-more="gameLogs.hasMore"
            :is-loading="isLoadingGameLogs"
            @load-more="getLogs"
          />
        </div>
      </details>

      <!-- 3. 干员卡片 -->
      <details
        :key="`chars-${account}`"
        class="collapse collapse-arrow s-card min-w-0 p-0! lg:order-3"
      >
        <summary class="collapse-title min-h-0 py-4! pr-12! pl-2! md:py-5! md:pl-5!">
          <h2
            class="text-xl font-bold tracking-normal after:mt-2.5 after:block after:h-0.5 after:w-5 after:bg-info after:content-['']"
          >
            干员一览
          </h2>
        </summary>
        <div class="collapse-content px-2! pb-4! md:px-5! md:pb-5!">
          <CharsPanel
            :key="account"
            :account="account"
            :chars="sixStarChars"
            :is-loading="isLoadingChars"
            :development-tasks="operatorDevelopmentTasks"
            @development-change="refreshGameDetails"
          />
        </div>
      </details>

      <details
        :key="`scheduling-${account}`"
        class="collapse collapse-arrow s-card min-w-0 p-0! lg:order-5 lg:col-span-2"
        @toggle="schedulingOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary class="collapse-title min-h-0 py-4! pr-12! pl-3! md:py-5! md:pl-5!">
          <h2 class="text-xl font-bold">排班建议（有限技能支持）</h2>
        </summary>
        <div class="collapse-content px-3! pb-4! md:px-5! md:pb-5!">
          <BaseSchedulingPanel :key="account" :source="schedulingSource" :active="schedulingOpen" />
        </div>
      </details>

      <!-- 4. 道具卡片 -->
      <details
        :key="`items-${account}`"
        class="collapse collapse-arrow s-card min-w-0 p-0! lg:order-4"
      >
        <summary class="collapse-title min-h-0 py-4! pr-12! pl-3! md:py-5! md:pl-5!">
          <h2
            class="text-xl font-bold tracking-normal after:mt-2.5 after:block after:h-0.5 after:w-5 after:bg-info after:content-['']"
          >
            道具一览
          </h2>
        </summary>
        <div class="collapse-content px-3! pb-4! md:px-5! md:pb-5!">
          <ItemsPanel
            :key="account"
            :inventory="details?.inventory"
            :is-loading="isLoadingGameDetails || gamesStore.isGameListIniting"
            :error="gameDetailsError"
          />
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseSchedulingPanel from '@/components/dashboard/game/BaseSchedulingPanel.vue';
import type { SchedulingRosterSource } from '@/utils/baseSchedulingInput';
import CharsPanel from "@/components/dashboard/game/CharsPanel.vue";
import ConfigPanel from "@/components/dashboard/game/ConfigPanel.vue";
import GameDetailHeader from "@/components/dashboard/game/GameDetailHeader.vue";
import GameSelector from "@/components/game/GameSelector.vue";
import ItemsPanel from "@/components/dashboard/game/ItemsPanel.vue";
import LogsPanel from "@/components/dashboard/game/LogsPanel.vue";
import { useGameChars } from "@/components/dashboard/game/composables/useGameChars";
import { GAME_LOG_QUERYABLE_STATUS_CODES } from "@/constants/game";
import { assets } from "@/services/assets";
import { Type } from "@/constants/ui";
import MobileSwipeMenuHeader from "@/shared/components/ui/MobileSwipeMenuHeader.vue";
import { useSwipeNavigation } from "@/shared/composables/useSwipeNavigation";
import { ROUTES } from "@/constants/app";
import apiClient from "@/services/apiClient";
import type { ApiGameDetail, ApiGameGame, ApiGameLogs } from "@/shared/types/api";
import { setMsg } from "@/utils/toast";
import { useGamesStore } from "@/stores/useGamesStore";
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
const gamesStore = useGamesStore();
const isDesktopViewport = typeof window !== "undefined" && window.innerWidth >= 768;

const gameDisplayName = (game: ApiGameGame) =>
  game.status.nick_name ? `Dr. ${game.status.nick_name}` : game.status.account;

// 路由参数
const account = computed(() => route.params.account as string);

// 当前选中的游戏
const selectedGame = computed(() => gamesStore.findGame(account.value));

const gameSelectorItems = computed(() =>
  gamesStore.gameList.map((game) => ({
    key: game.status.account,
    name: gameDisplayName(game),
  }))
);

const currentGameIndex = computed(() =>
  gamesStore.gameList.findIndex((game) => game.status.account === account.value)
);

const activeGameTitle = computed(() =>
  selectedGame.value ? gameDisplayName(selectedGame.value) : account.value
);

// 游戏详情
const details = ref<ApiGameDetail | null>(null);
const schedulingSource = ref<SchedulingRosterSource | null>(null);
const schedulingOpen = ref(false);
const isLoadingGameDetails = ref(false);
const gameDetailsError = ref(false);
let detailsRequestId = 0;
const canQueryDetails = computed(() =>
  !!selectedGame.value && GAME_LOG_QUERYABLE_STATUS_CODES.includes(selectedGame.value.status.code)
);

// 游戏日志
const gameLogs = ref<ApiGameLogs>({
  logs: [],
  hasMore: false,
});
const isLoadingGameLogs = ref(false);

// 使用 composable 获取干员数据
const { chars, isLoading: isLoadingChars } = useGameChars(account);

// 仅展示 6 星（rarity === 5）干员
const sixStarChars = computed(() =>
  chars.value.filter((c) => assets.value.getCharRarity(c.charId) === 5)
);

const operatorDevelopmentTasks = computed(
  () =>
    details.value?.config.operator_development_tasks ??
    selectedGame.value?.game_config.operator_development_tasks ??
    [],
);

const navigateBySwipe = (direction: "left" | "right") => {
  const nextIndex = direction === "left" ? currentGameIndex.value + 1 : currentGameIndex.value - 1;
  const nextGame = gamesStore.gameList[nextIndex];
  if (!nextGame || nextGame.status.account === account.value) return;

  router.replace({
    name: ROUTES.GAME_DETAIL.name,
    params: { account: nextGame.status.account },
  });
};

useSwipeNavigation({
  axis: "x",
  onSwipe: navigateBySwipe,
});

// 获取游戏详情
const getGameDetails = async (preserveCurrent = false) => {
  const requestId = ++detailsRequestId;
  const requestAccount = account.value;
  schedulingSource.value = null;
  if (!preserveCurrent) details.value = null;
  gameDetailsError.value = false;
  isLoadingGameDetails.value = false;
  if (!canQueryDetails.value) return;
  isLoadingGameDetails.value = true;

  try {
    const res = await apiClient.fetchGameDetails(requestAccount);
    if (requestId !== detailsRequestId || requestAccount !== account.value) return;
    schedulingSource.value = { status: 'received', response: res };
    if (res.data) {
      details.value = res.data;
    } else {
      gameDetailsError.value = true;
      setMsg(res.message, Type.Warning);
    }
  } catch (error) {
    if (requestId !== detailsRequestId || requestAccount !== account.value) return;
    gameDetailsError.value = true;
    schedulingSource.value = { status: 'request-failed' };
    console.error("Failed to fetch game details:", error);
  } finally {
    if (requestId === detailsRequestId && requestAccount === account.value) {
      isLoadingGameDetails.value = false;
    }
  }
};

const refreshGameDetails = async () => {
  await getGameDetails(true);
};

// 获取游戏日志
const getLogs = async () => {
  const game = selectedGame.value;
  if (!game || !GAME_LOG_QUERYABLE_STATUS_CODES.includes(game.status.code)) return;
  if (isLoadingGameLogs.value) return;
  isLoadingGameLogs.value = true;
  const lastLogId = gameLogs.value.logs[gameLogs.value.logs.length - 1]?.id || 0;

  try {
    const res = await apiClient.fetchGameLogs(account.value, lastLogId);
    if (res.data) {
      gameLogs.value.logs.push(...res.data.logs);
      gameLogs.value.hasMore = res.data.hasMore;
    } else {
      setMsg(res.message, Type.Warning);
    }
  } catch (error) {
    console.error("Failed to fetch game logs:", error);
  } finally {
    isLoadingGameLogs.value = false;
  }
};

// 监听账号变化
watch([account, canQueryDetails], () => getGameDetails(), { immediate: true });

watch(
  account,
  (newAccount) => {
    if (newAccount) {
      // 重置状态
      gameLogs.value = { logs: [], hasMore: false };

      // 加载数据
      getLogs();
    }
  },
  { immediate: true }
);
</script>
