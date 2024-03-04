import * as anchor from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { SolPayment } from "../target/types/sol_payment";
import { SystemProgram, Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createAccount, createAssociatedTokenAccount, createMint, getAssociatedTokenAddress, mintTo, mintToChecked } from "@solana/spl-token";
import assert from "assert";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";

describe("sol_payment", async () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.SolPayment as Program<SolPayment>;
  
  let connection: web3.Connection;
  let splToken: PublicKey;
  let mystate, vault, depositInfoAccount,withdrawInfoAccount, vaultForAtaAccount : PublicKey;
  let mystateBump, vaultBump, depositInfoAccountBump,withdrawInfoAccountBump, vaultForAtaAccountBump : number;


  let owner = Keypair.fromSecretKey(
    Uint8Array.from([34,129,14,229,84,135,171,245,101,24,255,156,64,34,238,205,35,8,74,40,32,32,143,175,32,137,63,144,153,31,161,212,92,193,0,22,13,92,236,7,103,174,64,78,135,212,192,230,11,74,204,218,246,183,253,183,27,37,222,216,29,135,171,10])
  );
  
  let authority = Keypair.fromSecretKey(
    Uint8Array.from([240,134,154,42,167,196,57,191,226,246,239,39,8,127,178,168,138,249,169,197,213,44,13,120,154,229,71,67,40,68,28,185,39,90,12,53,32,107,106,93,13,184,86,30,227,113,80,255,80,65,96,182,203,4,84,221,225,101,80,206,86,221,59,246])
  );

  let feePayer = Keypair.fromSecretKey(
    Uint8Array.from([106,105,75,250,115,142,67,12,123,100,253,72,31,213,29,115,116,169,152,9,165,30,154,141,109,7,126,228,157,250,11,30,240,67,121,201,17,8,3,129,155,162,76,82,43,63,48,18,117,80,210,98,23,214,194,157,223,28,2,26,211,31,53,157])
  );




  before(async () => {
    // Connect to the local Solana cluster
    connection = new web3.Connection("https://api.devnet.solana.com", "confirmed");
    // Configure the client to use the local cluster
    anchor.setProvider(anchor.AnchorProvider.env());
    // Initialize the HadesPayment program
  });
  it("Mint Tokens!", async () => {
    await sleep(2000); // Adjust the wait time as needed
    // Create a new antCoin token
    splToken = await createMint(
      connection, // conneciton
      feePayer, // fee payer
      feePayer.publicKey, // mint authority
      null, // freeze authority (you can use `null` to disable it. when you disable it, you can't turn it on again)
      6 // decimals
    );
    console.log(`splToken: ${splToken.toBase58()}`);
  });

  it("PDA Accounts!", async() => {
    [mystate, mystateBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("MY-STATE-SEED")],
      program.programId
    );
  
    [vault, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("VAULT-SEED")],
      program.programId
    );
  
    [depositInfoAccount, depositInfoAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("DEPOSIT-STATE-SEED"), owner.publicKey.toBuffer()],
      program.programId
    );
  
    [withdrawInfoAccount, withdrawInfoAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("WITHDRAW-STATE-SEED"), owner.publicKey.toBuffer()],
      program.programId   
    );
  
    [vaultForAtaAccount, vaultForAtaAccountBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("SPL-STATE-SEED"),splToken.toBuffer()],
      // [Buffer.from("SPL-STATE-SEED")],
      program.programId   
    );
  })

  it("Initializes MyState account", async () => {
    // Wait for the airdrop to be confirmed
    await sleep(2000); // Adjust the wait time as needed

    // Initialize MyState account
    try {
      const tx = await program.rpc.initialize({
        accounts: {
          signer: authority.publicKey,
          mystate: mystate,
          vault: vault,
          systemProgram: SystemProgram.programId,
        },
        signers: [authority], // Both mystate and authority are signers
      });
      console.log("Initialize success: tx ->: ", tx);
  
      // Fetch the initialized MyState account
      const myStateAccount = await program.account.myState.fetch(mystate);
      console.log("state account was created successfully: ", myStateAccount);

    } catch (error) {
      console.log(error);
    }
   
  });

  it("Should add and remove authorized addresses correctly", async () => {
    // Generate keypairs for the authority and new authorized address
    const newAddress = Keypair.generate();
     // Add the new address as an authorized address
     await program.rpc.addAuthorizedAddress(newAddress.publicKey, {
      accounts: {
        mystate: mystate,
        authority: authority.publicKey,
      },
      signers: [authority],
    });

    await program.rpc.addAuthorizedAddress(owner.publicKey, {
      accounts: {
        mystate: mystate,
        authority: authority.publicKey,
      },
      signers: [authority],
    });


    // Fetch the updated MyState account
    const updatedMyState = await program.account.myState.fetch(mystate);
    console.log("After add authorized address ->",updatedMyState);
    sleep(1500);

    // Remove the new address from the authorized addresses
    await program.rpc.removeAuthorizedAddress(newAddress.publicKey, {
      accounts: {
        mystate: mystate,
        authority: authority.publicKey,
      },
      signers: [authority],
    });

    // Fetch the updated MyState account again
    const finalMyState = await program.account.myState.fetch(mystate);

    // Check if the new address is removed from the authorized addresses
    console.log("Delete authorized address -> ", finalMyState);
  });

  it("Deposit SOL from users to the contract's account", async () => {
    // Define the amount of lamports to deposit
    const depositAamount = 100000000;
    // Deposit lamports into MyState account
    const txHash = await program.rpc.depositLamports(new anchor.BN(depositAamount), {
      accounts: {
        user: owner.publicKey,
        mystate,
        vault,
        depositInfoAccount,
        systemProgram: SystemProgram.programId,
      },
      signers: [owner],
    });

    // Fetch the initialized MyState account
    const myStateData = await program.account.myState.fetch(mystate);
    console.log("Deposit SOL successfully: ", myStateData);

    const depositInfoAccountData = await program.account.depositWallet.fetch(depositInfoAccount);
    console.log("Deposit info per wallet ", depositInfoAccountData);
  });

  it("Withdraw SOL from contract's account to the user", async () => {
    // Define the amount of lamports to withdraw
    const withdrawAmount = 100000000;
    // Withdraw lamports from MyState account to user
    await program.rpc.withdrawLamports(new anchor.BN(withdrawAmount),"withdraw success", {
      accounts: {
        user: owner.publicKey,
        mystate,
        vault,
        withdrawInfoAccount,
        systemProgram: SystemProgram.programId,
      },
      signers: [owner],
    });
   
    await sleep(2000); // Adjust the wait time as needed
   
     // Fetch the initialized MyState account
     const myStateData = await program.account.myState.fetch(mystate);
     console.log("Withdraw SOL successfully: ", myStateData);
 
     const withdrawInfoAccountData = await program.account.withdrawWallet.fetch(withdrawInfoAccount);
     console.log("Withdraw info per wallet ", withdrawInfoAccountData);
  });

  it("Deposits SPL tokens into the contract's account", async () => {
    // Create token accounts for the from and to accounts
    const fromAta = await createAssociatedTokenAccount(
      connection,
      feePayer,
      splToken,
      owner.publicKey
    );

    // Mint tokens to the 'from' associated token account
    const mintAmount = 1000000000;
    try {
      const tx = await mintToChecked(
        connection,
        feePayer,
        splToken,
        fromAta,
        feePayer,
        mintAmount,
        6
      );

      console.log(tx);
    } catch (error) {
      console.log(error);
    }
    // Send transaction
    sleep(3000);
    const transferAmount = 100000000;
    try {
      await program.rpc.depositSpl(new anchor.BN(transferAmount), {
        accounts: {
          user: owner.publicKey,
          mystate,
          tokenForDeposit: splToken,
          fromAta,
          vaultForAta: vaultForAtaAccount,
          depositInfoAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        },
        signers: [owner],
      });
    } catch (error) {
      console.log(error);
    }

    
    await sleep(2000); // Adjust the wait time as needed
  
    // Fetch the initialized MyState account
    const myStateData = await program.account.myState.fetch(mystate);
    console.log("Deposit SPL successfully: ", myStateData);

    const depositInfoAccountData = await program.account.depositWallet.fetch(depositInfoAccount);
    console.log("Deposit SPL info per wallet ", depositInfoAccountData);
 
  });

  it("WithDraw SPL tokens into the contract's account", async () => {
    // Create token accounts for the from and to accounts
    const toAta = await getAssociatedTokenAddress(
      splToken,
      owner.publicKey
    );

    // Send transaction
    sleep(2000);
    const transferAmount = 10000000;
    // try {
    //   await program.rpc.withdrawSpl(new anchor.BN(transferAmount),"withdraw spl success", {
    //     accounts: {
    //       user: owner.publicKey,
    //       mystate,
    //       tokenForWithdraw: splToken,
    //       toAta,
    //       vaultForAta: vaultForAtaAccount,
    //       withdrawInfoAccount,
    //       tokenProgram: TOKEN_PROGRAM_ID,
    //       systemProgram: SystemProgram.programId,
    //     },
    //     signers: [owner],
    //   });
    // } catch (error) {
    //   console.log(error);d
    // }

    
    await sleep(2000); // Adjust the wait time as needed
  
    // Fetch the initialized MyState account
    const myStateData = await program.account.myState.fetch(mystate);
    console.log("WithDraw SPL successfully: ", myStateData);

    const withdrawInfoAccountData = await program.account.withdrawWallet.fetch(withdrawInfoAccount);
    console.log("WithDraw SPL info per wallet ", withdrawInfoAccountData);
 
  });
 
});

// Utility function to sleep for a specified duration
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
