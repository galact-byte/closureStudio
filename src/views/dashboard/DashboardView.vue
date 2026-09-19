<template>
  <div class="flex h-full">
    <div
      class="w-full flex-col max-w-4xl 2xl:max-w-6xl xl:mr-auto s-margin md:!flex lg:ml-[calc((100vw-56rem)/2)] 2xl:ml-[calc((100vw-72rem)/2)]"
    >
      <div class="bg-base-300 shadow-lg rounded-lg px-4 py-1 blog relative">
        <div class="text-2xl md:text-4xl font-bold text-info mt-3">
          📢 今日特价
        </div>
        <p
          v-for="k in config.announcement?.split('\n') || ['可露希尔逃跑了']"
          :key="k"
        >
          {{ k }}
        </p>
        <div class="divider mt-0">个人信息</div>
        <QQBindingStatus />
      </div>
      <IndexStatus />
      <PublicAnnouncements />
      <div class="text-2xl font-bold">
        我的托管（{{ userGameList.length }} 已用 / {{ MAX_GAME_SLOTS }} 槽位）
      </div>
      <div v-if="isGameListIniting" class="h-72 flex justify-center w-full">
        <span class="loading loading-ring loading-lg"></span>
        <span class="loading loading-ring loading-lg"></span>
        <span class="loading loading-ring loading-lg"></span>
      </div>
      <GameList
        :user-game-list="userGameList"
        :can-create-game="canCreateGame"
        :is-loading="isLoading"
        :is-suspend-status="isSuspendStatus"
        :is-update-status="isUpdateStatus"
        @open-game-conf="openGameConf"
        @suspend="handleGameSuspendBtnOnClick"
        @update-password="handleUpdatePasswdBtnOnClick"
        @login="handleGameLoginBtnOnClick"
        @delete="handleDeleteBtnOnClick"
        @create="handleCreateGame"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { ApiSystemConfig, GameAccountForm } from "@/shared/types/api";
import { MAX_GAME_SLOTS } from "@/constants/game";
import IndexStatus from "@/components/dashboard/VersionStatus.vue";
import PublicAnnouncements from "@/components/dashboard/PublicAnnouncements.vue";
import GameList from "@/components/dashboard/GameList.vue";
import QQBindingStatus from "@/components/dashboard/QQBindingStatus.vue";
import YouMayKnow from "@/components/dashboard/dialogs/YouMayKnow.vue";
import { useLoading } from "@/shared/composables/useLoading";
import { useCaptcha } from "@/services/captchaActions";
import { useGamesStore } from "@/stores/useGamesStore";
import { useGameActions } from "@/components/dashboard/composables/useGameActions";
import showDialog from "@/shared/components/dialog/dialog";
import apiClient from "@/services/apiClient";
import { ROUTES } from "@/constants/app";

const router = useRouter();
const gamesStore = useGamesStore();
const config = ref({} as ApiSystemConfig);
const selectedRegisterForm = ref({} as GameAccountForm);
const { isLoading } = useLoading();
const captcha = useCaptcha();

const userGameList = computed(() => gamesStore.gameList);
const canCreateGame = computed(() => gamesStore.canCreateGame);
const isGameListIniting = computed(() => gamesStore.isGameListIniting);

const {
  findGame,
  createGameButtonOnClick,
  isUpdateStatus,
  isSuspendStatus,
  handleDeleteBtnOnClick,
  handleUpdatePasswdBtnOnClick,
  gameLogin,
  gameSuspend,
} = useGameActions({
  gamesStore,
  captcha,
  isLoading,
  selectedRegisterForm,
});

onMounted(async () => {
  gamesStore.initializeGameListServerConnection();
  const response = await apiClient.fetchSystemConfig();
  config.value = response.data;
  showDialog(YouMayKnow);
});

const handleGameSuspendBtnOnClick = async (gameAccount: string) => {
  await gameSuspend(gameAccount);
};

const handleGameLoginBtnOnClick = async (gameAccount: string) => {
  await gameLogin(gameAccount);
};

const handleCreateGame = () => {
  createGameButtonOnClick(gameLogin);
};

const openGameConf = (account: string) => {
  const game = findGame(account);
  if (!game) return;
  router.push({
    name: ROUTES.GAME_DETAIL.name,
    params: { account },
  });
};
</script>

<style>
div,
img {
  user-select: none;
  -webkit-user-drag: none;
}
</style>
