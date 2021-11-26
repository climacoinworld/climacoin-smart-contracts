// test/TokenStaking.js
// Load dependencies
const { use, expect } = require("chai");

const { solidity } = require("ethereum-waffle");
use(solidity);
use(require("chai-datetime"));

const { BN, expectRevert, time } = require("@openzeppelin/test-helpers");

const REWARD_PROVIDER_ROLE = web3.utils.keccak256("REWARD_PROVIDER_ROLE");
const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

const SILVER = unpack("silver");
const GOLD = unpack("gold");
const PLATINUM = unpack("platinum");

function unpack(str) {
  let buf = Buffer.from(str);
  strBytes = "";
  for (var i = 0; i < buf.length; i++) strBytes += buf[i].toString(16);

  while (strBytes.length < 64) strBytes += "0";

  return "0x" + strBytes;
}

// Start test block
describe("TokenStaking (proxy)", function () {
  let tokenStaking;
  let token;

  beforeEach(async function () {
    [owner, user1, user2, user3, _] = await ethers.getSigners();

    let TokenFactory = await ethers.getContractFactory("ClimaCoinToken");
    token = await upgrades.deployProxy(
      TokenFactory,
      ["ClimaCoin Token", "CLC", 29000000000],
      { initializer: "initialize" }
    );

    await token.transfer(user1.address, ethers.utils.parseEther("2000000"));
    await token.transfer(user2.address, ethers.utils.parseEther("2000000"));
    await token.transfer(user3.address, ethers.utils.parseEther("2000000"));

    let TokenStakingFactory = await ethers.getContractFactory("TokenStaking");
    tokenStaking = await upgrades.deployProxy(
      TokenStakingFactory,
      [token.address],
      { initializer: "initialize" }
    );
  });

  // Test case
  describe("check basic init", () => {
    it("should set a staked token", async () => {
      expect((await tokenStaking.tokenContract()).toString()).to.equal(
        token.address
      );
    });

    it("has a totalStakedFunds", async () => {
      expect((await tokenStaking.totalStakedFunds()).toString()).to.equal("0");
    });

    it("has a paused", async () => {
      expect(await tokenStaking.paused()).to.equal(false);
    });

    it("has a REWARD_PROVIDER_ROLE", async () => {
      expect(await tokenStaking.REWARD_PROVIDER_ROLE()).to.equal(
        REWARD_PROVIDER_ROLE
      );
    });

    it("should set roles accordingly", async () => {
      expect(
        await tokenStaking.hasRole(DEFAULT_ADMIN_ROLE, owner.address)
      ).to.equal(true);

      expect(
        await tokenStaking.hasRole(REWARD_PROVIDER_ROLE, owner.address)
      ).to.equal(true);
    });

    describe("should define packages", () => {
      describe("Silver Package", () => {
        let package;

        before(async () => {
          package = await tokenStaking.packages(SILVER);
        });

        it("has a name", async () => {
          expect(package._packageName).to.equal(SILVER);
        });

        it("has a days period", () => {
          expect(package._daysLocked.toString()).to.equal("7");
        });

        it("has a days blocked", () => {
          expect(package._daysBlocked.toString()).to.equal("3");
        });

        it("has a percentage interest", () => {
          expect(package._packageInterest.toString()).to.equal("8");
        });
      });

      describe("Gold Package", () => {
        let package;

        before(async () => {
          package = await tokenStaking.packages(GOLD);
        });

        it("has a name", async () => {
          expect(package._packageName).to.equal(GOLD);
        });

        it("has a days period", () => {
          expect(package._daysLocked.toString()).to.equal("30");
        });

        it("has a days blocked", () => {
          expect(package._daysBlocked.toString()).to.equal("10");
        });

        it("has a percentage interest", () => {
          expect(package._packageInterest.toString()).to.equal("12");
        });
      });

      describe("Platinum Package", () => {
        let package;

        before(async () => {
          package = await tokenStaking.packages(PLATINUM);
        });

        it("has a name", async () => {
          expect(package._packageName).to.equal(PLATINUM);
        });

        it("has a days period", () => {
          expect(package._daysLocked.toString()).to.equal("60");
        });

        it("has a days blocked", () => {
          expect(package._daysBlocked.toString()).to.equal("20");
        });

        it("has a percentage interest", () => {
          expect(package._packageInterest.toString()).to.equal("15");
        });
      });
    });
  });

  describe("Functions", () => {
    describe("stakeTokens", () => {
      beforeEach(async () => {
        await token
          .connect(user1)
          .approve(tokenStaking.address, ethers.utils.parseEther("200"));
        await token
          .connect(user2)
          .approve(tokenStaking.address, ethers.utils.parseEther("200"));
      });

      it("should revert staking on pause", async () => {
        await tokenStaking
          .connect(user1)
          .stakeTokens(ethers.utils.parseEther("80"), GOLD);
        await tokenStaking.pauseStaking();

        await expectRevert(
          tokenStaking
            .connect(user1)
            .stakeTokens(ethers.utils.parseEther("80"), GOLD),
          "The staking is paused."
        );
      });

      it("should revet if _amount !> 0", async () => {
        await expectRevert(
          tokenStaking.connect(user1).stakeTokens(0, SILVER),
          "You need to stake a positive number of tokens."
        );
      });

      it("should revert if no staking package", async () => {
        await expectRevert(
          tokenStaking
            .connect(user1)
            .stakeTokens(ethers.utils.parseEther("10"), REWARD_PROVIDER_ROLE),
          "There is no staking package with the declared name or the staking package is poorly formated."
        );
      });

      it("should add to totalStakedBalance", async () => {
        expect(
          (await tokenStaking.totalStakedBalance(user1.address)).toString()
        ).to.equal("0");
        await tokenStaking
          .connect(user1)
          .stakeTokens(ethers.utils.parseEther("10"), SILVER);

        expect(
          (await tokenStaking.totalStakedBalance(user1.address)).toString()
        ).to.equal(ethers.utils.parseEther("10").toString());

        await tokenStaking
          .connect(user1)
          .stakeTokens(ethers.utils.parseEther("5"), GOLD);
        await tokenStaking
          .connect(user1)
          .stakeTokens(ethers.utils.parseEther("15"), PLATINUM);
        await tokenStaking
          .connect(user2)
          .stakeTokens(ethers.utils.parseEther("50"), GOLD);
        expect(
          (await tokenStaking.totalStakedBalance(user1.address)).toString()
        ).to.equal(ethers.utils.parseEther("30").toString());
      });

      it("should add to stakes", async () => {
        let timestamp = Math.floor(Date.now() / 1000);

        await tokenStaking
          .connect(user1)
          .stakeTokens(ethers.utils.parseEther("10"), SILVER);
        let stake = await tokenStaking.stakes(user1.address, 0);
        expect(stake._amount.toString()).to.equal(
          ethers.utils.parseEther("10").toString()
        );
        expect(new Date(parseInt(stake._timestamp))).to.afterOrEqualDate(
          new Date(timestamp)
        );
        expect(stake._packageName).to.equal(SILVER);
        expect(stake._withdrawnTimestamp.toString()).to.equal("0");

        await tokenStaking
          .connect(user1)
          .stakeTokens(ethers.utils.parseEther("20"), PLATINUM);
        stake = await tokenStaking.stakes(user1.address, 1);
        expect(stake._amount.toString()).to.equal(
          ethers.utils.parseEther("20").toString()
        );
        expect(new Date(parseInt(stake._timestamp))).to.afterOrEqualDate(
          new Date(timestamp)
        );
        expect(stake._packageName).to.equal(PLATINUM);
        expect(stake._withdrawnTimestamp.toString()).to.equal("0");
      });

      it("should update hasStaked", async () => {
        expect(await tokenStaking.hasStaked(user1.address)).to.equal(false);
        await tokenStaking
          .connect(user1)
          .stakeTokens(ethers.utils.parseEther("10"), SILVER);
        expect(await tokenStaking.hasStaked(user1.address)).to.equal(true);
      });

      it("should transfer token", async () => {
        expect(
          (await token.balanceOf(tokenStaking.address)).toString()
        ).to.equal("0");
        expect((await token.balanceOf(user1.address)).toString()).to.equal(
          ethers.utils.parseEther("2000000").toString()
        );
        await tokenStaking
          .connect(user1)
          .stakeTokens(ethers.utils.parseEther("100"), SILVER);

        expect(
          (await token.balanceOf(tokenStaking.address)).toString()
        ).to.equal(ethers.utils.parseEther("100").toString());
        expect((await token.balanceOf(user1.address)).toString()).to.equal(
          ethers.utils.parseEther("1999900").toString()
        );
      });

      it("should catch StakeAdded event", async () => {
        await expect(
          tokenStaking
            .connect(user1)
            .stakeTokens(ethers.utils.parseEther("100"), SILVER)
        )
          .to.emit(tokenStaking, "StakeAdded")
          .withArgs(user1.address, SILVER, ethers.utils.parseEther("100"), "0");
      });
    });
  });
});