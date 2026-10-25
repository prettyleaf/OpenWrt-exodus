include $(TOPDIR)/rules.mk

PKG_NAME:=mihomo-meta
PKG_VERSION:=1.19.33
PKG_RELEASE:=1

PKG_LICENSE:=GPL3.0+
PKG_MAINTAINER:=Joseph Mory <morytyann@gmail.com>

# official prebuilt binary from MetaCubeX releases, the variant follows the GOARCH/GOARM/GOMIPS choice of OpenWrt golang packages
ifeq ($(ARCH),aarch64)
  MIHOMO_ARCH:=arm64
else ifeq ($(ARCH),arm)
  MIHOMO_ARM_FPU:=$(word 2,$(subst +,$(space),$(call qstrip,$(CONFIG_CPU_TYPE))))
  ifeq ($(MIHOMO_ARM_FPU),)
    MIHOMO_ARCH:=armv5
  else ifneq ($(filter $(MIHOMO_ARM_FPU),vfp vfpv2),)
    MIHOMO_ARCH:=armv6
  else
    MIHOMO_ARCH:=armv7
  endif
else ifeq ($(ARCH),i386)
  MIHOMO_ARCH:=$(if $(CONFIG_TARGET_x86_geode)$(CONFIG_TARGET_x86_legacy),386-softfloat,386)
else ifeq ($(ARCH),x86_64)
  MIHOMO_ARCH:=amd64-v1
else ifeq ($(ARCH),mips)
  MIHOMO_ARCH:=mips-$(if $(CONFIG_HAS_FPU),hardfloat,softfloat)
else ifeq ($(ARCH),mipsel)
  MIHOMO_ARCH:=mipsle-$(if $(CONFIG_HAS_FPU),hardfloat,softfloat)
else ifeq ($(ARCH),mips64)
  MIHOMO_ARCH:=mips64
else ifeq ($(ARCH),mips64el)
  MIHOMO_ARCH:=mips64le
else ifeq ($(ARCH),riscv64)
  MIHOMO_ARCH:=riscv64
else ifeq ($(ARCH),loongarch64)
  MIHOMO_ARCH:=loong64-abi2
endif

# sha256 of release assets, updated by the dependabot workflow
MIHOMO_HASH_arm64:=ba408b317080ee265c46cb923a50018c1b82cbd708551cdd46a1e3e307396187
MIHOMO_HASH_armv5:=5981edb813ce9cc112852ba12c0d42a5187b1b0f26cf307629f2d68719fedcb9
MIHOMO_HASH_armv6:=288d525db3a8bac99ee5497ca0cba3d14c8a2397c7bb5354f84d6240cf907c8d
MIHOMO_HASH_armv7:=c8a8f9bcaab914269fbdca7569e4a9f024cc667ecf12eb43e8ccdc01b3731604
MIHOMO_HASH_386:=e5580e1b8484e484936b0cefb14f22e9c6e86028c64e14824858fdb5eeedbd3e
MIHOMO_HASH_386-softfloat:=517317a7443aa79022b9a55cc17f8d9d432c6f19150432a5f9d15a2b59d537a5
MIHOMO_HASH_amd64-v1:=8ec92e7b2fdc6b853ba00156bab7e4e965c8b0d843b8c4ac8ab98795f02ad524
MIHOMO_HASH_mips-softfloat:=d57934651a36af34c4a45539a946d1c8a35ce6381f93a79ca417b5e78a6170a7
MIHOMO_HASH_mips-hardfloat:=ea236f3adc2c6c8b259bbe18c0805508046deb940c0dbd152db92bed2942bb4f
MIHOMO_HASH_mipsle-softfloat:=ad6b3837db8dff2a6853a3c1604b82ee2f7e4019f626a5ab61f46b7c565871c4
MIHOMO_HASH_mipsle-hardfloat:=9772f614ae7e1ef7e4c918cf8cdf8cce0b023a62ec4017c41a7e85a567014eb3
MIHOMO_HASH_mips64:=018a08fcdef319a36bb545cb5a9bb8841ccf5b72cc533c838ae2d497c7e128b3
MIHOMO_HASH_mips64le:=a917b212031b56521ab96f14db35302de27918059965de5c7ec893ea1d4bbe61
MIHOMO_HASH_riscv64:=bdcf02e83108c2e94ca38ee95c891509a7b188082f5ec85c2481ea28f607fa41
MIHOMO_HASH_loong64-abi2:=d125e62a3f5dc79a85f8463a965e745ccd658b5177c2f95480977c2cb8584176

PKG_SOURCE:=mihomo-linux-$(MIHOMO_ARCH)-v$(PKG_VERSION).gz
PKG_SOURCE_URL:=https://github.com/MetaCubeX/mihomo/releases/download/v$(PKG_VERSION)/
PKG_HASH:=$(MIHOMO_HASH_$(MIHOMO_ARCH))

include $(INCLUDE_DIR)/package.mk

define Package/mihomo-meta
  SECTION:=net
  CATEGORY:=Network
  TITLE:=A rule based proxy in Go.
  URL:=https://wiki.metacubex.one
  DEPENDS:=@(aarch64||arm||i386||loongarch64||mips||mips64||mips64el||mipsel||riscv64||x86_64) +ca-bundle +ip-full +kmod-inet-diag +kmod-tun
  PROVIDES:=mihomo
  CONFLICTS:=mihomo-alpha
  ALTERNATIVES:=\
    300:/usr/bin/mihomo:/usr/libexec/mihomo
endef

define Package/mihomo-meta/description
  A rule based proxy in Go. Official prebuilt binary from MetaCubeX releases.
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	gzip -dc $(DL_DIR)/$(PKG_SOURCE) > $(PKG_BUILD_DIR)/mihomo
endef

define Build/Compile
endef

# the binary is already stripped by upstream, stripping a go binary again can break it
STRIP:=:
RSTRIP:=:

define Package/mihomo-meta/install
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/mihomo $(1)/usr/libexec/mihomo
endef

$(eval $(call BuildPackage,mihomo-meta))
